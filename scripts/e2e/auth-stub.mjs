/**
 * Local stand-in for Supabase Auth (GoTrue), for the browser tests only.
 *
 * The real service can't run offline and must never receive test sign-ups. This
 * answers the handful of endpoints supabase-js calls (sign-up with e-mail
 * confirmation, password sign-in, PKCE exchange, refresh, sign-out, recovery,
 * password change) with the same shapes and error codes, signs access tokens with
 * the API's SUPABASE_JWT_SECRET, and inserts new accounts into the local
 * auth.users so the database trigger creates the profile like in production.
 *
 * "E-mails" are not sent: the link of the last one is kept and served on
 * GET /__test/mail?email=… so a test can open it like a member would. It is the
 * link of the templates in docs/EMAIL_CONFIGURATION.md (token hash, opens on any
 * device); add &template=legacy for the older {{ .ConfirmationURL }} link, which
 * only completes in the browser that asked for it.
 */
import crypto from "node:crypto";
import http from "node:http";
import pg from "pg";

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");

export async function startAuthStub({ port, databaseUrl, jwtSecret, defaultPassword }) {
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 2 });
  /** email → { id, password, confirmed, banned, meta } */
  const accounts = new Map();
  /** email → links of the last e-mail "sent": { hash, legacy } */
  const mail = new Map();
  /** Both forms of one e-mail link; they share the same single-use token. */
  function sendLink(email, type, challenge, redirect) {
    const token = crypto.randomBytes(12).toString("base64url");
    links.set(token, { email, type, challenge });
    const site = redirect ? new URL(redirect).origin : "";
    mail.set(email, {
      hash: `${site}/auth/confirm?token_hash=${token}&type=${type === "signup" ? "email" : type}&next=${encodeURIComponent(redirect)}`,
      legacy: `http://127.0.0.1:${port}/auth/v1/verify?token=${token}&type=${type}&redirect_to=${encodeURIComponent(redirect)}`,
    });
  }
  /** one-time values: verify token / auth code / refresh token → payload */
  const links = new Map();
  const codes = new Map();
  const refreshTokens = new Map();
  let accessTtl = 3600;

  /** Members created by the SQL seed sign in with the default password. */
  async function account(email) {
    const key = email.toLowerCase();
    if (accounts.has(key)) return accounts.get(key);
    const { rows } = await pool.query(
      "select id, raw_user_meta_data as meta from auth.users where lower(email) = $1",
      [key],
    );
    if (!rows[0]) return null;
    const a = {
      id: rows[0].id,
      email: key,
      password: defaultPassword,
      confirmed: true,
      banned: false,
      meta: rows[0].meta ?? {},
    };
    accounts.set(key, a);
    return a;
  }

  const userJson = (a) => ({
    id: a.id,
    aud: "authenticated",
    role: "authenticated",
    email: a.email,
    email_confirmed_at: a.confirmed ? new Date().toISOString() : undefined,
    app_metadata: { provider: "email", providers: ["email"] },
    user_metadata: a.meta,
    identities: [{ id: a.id, provider: "email" }],
    created_at: new Date().toISOString(),
  });

  function session(a) {
    const exp = Math.floor(Date.now() / 1000) + accessTtl;
    const head = b64({ alg: "HS256", typ: "JWT" });
    const body = b64({
      sub: a.id,
      email: a.email,
      aud: "authenticated",
      role: "authenticated",
      exp,
    });
    const sig = crypto
      .createHmac("sha256", jwtSecret)
      .update(`${head}.${body}`)
      .digest("base64url");
    const refresh = crypto.randomBytes(12).toString("base64url");
    refreshTokens.set(refresh, a.email);
    return {
      access_token: `${head}.${body}.${sig}`,
      token_type: "bearer",
      expires_in: accessTtl,
      expires_at: exp,
      refresh_token: refresh,
      user: userJson(a),
    };
  }

  function bearer(req) {
    const token = (req.headers.authorization ?? "").replace(/^Bearer /, "");
    try {
      const [h, p, sig] = token.split(".");
      const good = crypto.createHmac("sha256", jwtSecret).update(`${h}.${p}`).digest("base64url");
      if (sig !== good) return null;
      const claims = JSON.parse(Buffer.from(p, "base64url").toString());
      return claims.exp * 1000 > Date.now() ? claims : null;
    } catch {
      return null;
    }
  }

  const weak = (pw) => typeof pw !== "string" || pw.length < 8;

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const cors = {
      "access-control-allow-origin": req.headers.origin ?? "*",
      "access-control-allow-headers":
        req.headers["access-control-request-headers"] ?? "authorization, apikey, content-type",
      "access-control-allow-methods": "GET, POST, PUT, DELETE, OPTIONS",
      "access-control-allow-credentials": "true",
    };
    const send = (status, body) => {
      res.writeHead(status, { ...cors, "content-type": "application/json" });
      res.end(body === undefined ? "" : JSON.stringify(body));
    };
    const fail = (status, error_code, msg) => send(status, { code: status, error_code, msg });
    if (req.method === "OPTIONS") return send(204);

    let body = {};
    if (req.method === "POST" || req.method === "PUT") {
      const chunks = [];
      for await (const c of req) chunks.push(c);
      try {
        body = JSON.parse(Buffer.concat(chunks).toString() || "{}");
      } catch {
        return fail(400, "bad_json", "Could not parse request body as JSON");
      }
    }
    const route = `${req.method} ${url.pathname}`;

    try {
      // ── GoTrue admin API (service role): the demo mode prepares its accounts ──
      if (url.pathname === "/auth/v1/admin/users" && req.method === "GET") {
        const { rows } = await pool.query("select email from auth.users order by email");
        const users = [];
        for (const r of rows) users.push(userJson(await account(r.email)));
        return send(200, { users, aud: "authenticated" });
      }
      if (url.pathname === "/auth/v1/admin/users" && req.method === "POST") {
        const email = String(body.email ?? "").toLowerCase();
        if (await account(email))
          return fail(
            422,
            "email_exists",
            "A user with this email address has already been registered",
          );
        const { rows } = await pool.query(
          "insert into auth.users (email, raw_user_meta_data) values ($1, $2) returning id",
          [email, body.user_metadata ?? {}],
        );
        const a = {
          id: rows[0].id,
          email,
          password: body.password,
          confirmed: !!body.email_confirm,
          banned: false,
          meta: body.user_metadata ?? {},
        };
        accounts.set(email, a);
        return send(200, userJson(a));
      }
      const adminUser = url.pathname.match(/^\/auth\/v1\/admin\/users\/([\w-]+)$/);
      if (adminUser && req.method === "PUT") {
        const { rows } = await pool.query("select email from auth.users where id::text = $1", [
          adminUser[1],
        ]);
        const a = rows[0] && (await account(rows[0].email));
        if (!a) return fail(404, "user_not_found", "User not found");
        if ("password" in body) a.password = body.password;
        if (body.email_confirm) a.confirmed = true;
        if (body.ban_duration === "none") a.banned = false;
        if (body.user_metadata) a.meta = body.user_metadata;
        return send(200, userJson(a));
      }

      switch (route) {
        // ── Test controls ────────────────────────────────────────────────────
        case "GET /__test/mail": {
          const sent = mail.get((url.searchParams.get("email") ?? "").toLowerCase());
          const link = sent?.[url.searchParams.get("template") === "legacy" ? "legacy" : "hash"];
          return send(link ? 200 : 404, { link: link ?? null });
        }
        case "POST /__test/account": {
          // { email, confirmed?, banned?, password? }: change the state of an account
          const a = await account(body.email);
          if (!a) return send(404, {});
          for (const k of ["confirmed", "banned", "password"]) if (k in body) a[k] = body[k];
          return send(200, {});
        }
        case "POST /__test/config": {
          if (typeof body.accessTtl === "number") accessTtl = body.accessTtl;
          return send(200, {});
        }

        // ── GoTrue ───────────────────────────────────────────────────────────
        case "POST /auth/v1/signup": {
          const email = String(body.email ?? "").toLowerCase();
          if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
            return fail(
              400,
              "validation_failed",
              "Unable to validate email address: invalid format",
            );
          if (weak(body.password))
            return fail(422, "weak_password", "Password should be at least 8 characters.");
          const existing = await account(email);
          if (existing?.confirmed) {
            // Confirmations on: GoTrue never says the address is taken, it answers
            // with a look-alike user that has no identities and sends nothing.
            return send(200, { ...userJson(existing), id: crypto.randomUUID(), identities: [] });
          }
          let a = existing;
          if (!a) {
            const { rows } = await pool.query(
              "insert into auth.users (email, raw_user_meta_data) values ($1, $2) returning id",
              [email, body.data ?? {}],
            );
            a = {
              id: rows[0].id,
              email,
              password: body.password,
              confirmed: false,
              banned: false,
              meta: body.data ?? {},
            };
            accounts.set(email, a);
          }
          sendLink(email, "signup", body.code_challenge, url.searchParams.get("redirect_to") ?? "");
          return send(200, { ...userJson(a), confirmation_sent_at: new Date().toISOString() });
        }

        case "POST /auth/v1/resend": {
          return send(200, {});
        }

        case "POST /auth/v1/recover": {
          const email = String(body.email ?? "").toLowerCase();
          const a = await account(email);
          if (a)
            sendLink(
              email,
              "recovery",
              body.code_challenge,
              url.searchParams.get("redirect_to") ?? "",
            );
          // Same answer whether the account exists or not
          return send(200, {});
        }

        case "GET /auth/v1/verify": {
          const target = new URL(url.searchParams.get("redirect_to"));
          const link = links.get(url.searchParams.get("token"));
          links.delete(url.searchParams.get("token"));
          if (!link) {
            target.searchParams.set("error", "access_denied");
            target.searchParams.set("error_code", "otp_expired");
            target.searchParams.set("error_description", "Email link is invalid or has expired");
          } else {
            const a = await account(link.email);
            a.confirmed = true;
            const code = crypto.randomBytes(12).toString("base64url");
            codes.set(code, link);
            target.searchParams.set("code", code);
          }
          res.writeHead(302, { ...cors, location: target.toString() });
          return res.end();
        }

        // Token-hash link (supabase.auth.verifyOtp): no code verifier, any device
        case "POST /auth/v1/verify": {
          const link = links.get(body.token_hash);
          links.delete(body.token_hash);
          const expected = link?.type === "signup" ? ["signup", "email"] : [link?.type];
          if (!link || !expected.includes(body.type))
            return fail(403, "otp_expired", "Email link is invalid or has expired");
          const a = await account(link.email);
          a.confirmed = true;
          return send(200, session(a));
        }

        case "POST /auth/v1/token": {
          const grant = url.searchParams.get("grant_type");
          if (grant === "password") {
            const a = await account(String(body.email ?? ""));
            if (!a || a.password !== body.password)
              return fail(400, "invalid_credentials", "Invalid login credentials");
            if (!a.confirmed) return fail(400, "email_not_confirmed", "Email not confirmed");
            if (a.banned) return fail(400, "user_banned", "User is banned");
            return send(200, session(a));
          }
          if (grant === "pkce") {
            const link = codes.get(body.auth_code);
            codes.delete(body.auth_code);
            const challenge = crypto
              .createHash("sha256")
              .update(String(body.code_verifier ?? ""))
              .digest("base64url");
            if (!link || (link.challenge && link.challenge !== challenge))
              return fail(
                400,
                "flow_state_not_found",
                "invalid flow state, no valid flow state found",
              );
            return send(200, session(await account(link.email)));
          }
          if (grant === "refresh_token") {
            const email = refreshTokens.get(body.refresh_token);
            refreshTokens.delete(body.refresh_token);
            const a = email && (await account(email));
            if (!a || a.banned)
              return fail(
                400,
                "refresh_token_not_found",
                "Invalid Refresh Token: Refresh Token Not Found",
              );
            return send(200, session(a));
          }
          return fail(400, "invalid_grant", "unsupported grant type");
        }

        case "GET /auth/v1/user": {
          const claims = bearer(req);
          const a = claims && (await account(claims.email));
          return a ? send(200, userJson(a)) : fail(401, "bad_jwt", "invalid JWT");
        }

        case "PUT /auth/v1/user": {
          const claims = bearer(req);
          const a = claims && (await account(claims.email));
          if (!a) return fail(401, "bad_jwt", "invalid JWT");
          if ("password" in body) {
            if (weak(body.password))
              return fail(422, "weak_password", "Password should be at least 8 characters.");
            if (body.password === a.password)
              return fail(
                422,
                "same_password",
                "New password should be different from the old password.",
              );
            a.password = body.password;
          }
          return send(200, userJson(a));
        }

        case "POST /auth/v1/logout": {
          return send(204);
        }

        default:
          return fail(404, "not_found", `auth stub: ${route} is not implemented`);
      }
    } catch (err) {
      return fail(500, "unexpected_failure", String(err?.message ?? err));
    }
  });

  await new Promise((resolve) => server.listen(port, "127.0.0.1", resolve));
  return {
    async close() {
      await new Promise((resolve) => server.close(resolve));
      await pool.end();
    },
  };
}

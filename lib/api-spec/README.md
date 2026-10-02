# API specification

`openapi.yaml` documents the HTTP API served by `artifacts/api-server`.

The React client in `lib/api-client-react/src/generated` was first generated from
this file and is maintained by hand since (payment states, calendar slot fields,
join / leave / cancel answers, booking and court bodies). **Don't regenerate it**: it
would overwrite those changes. Endpoints added later live in `src/extras.ts`.
Update the spec and the client together when an endpoint changes.

The API validates its own input (`artifacts/api-server/src/routes`); there is no
generated server-side schema package.

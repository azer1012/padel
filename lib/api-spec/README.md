# API specification

`openapi.yaml` documents the HTTP API served by `artifacts/api-server`.

The React client in `lib/api-client-react/src/generated` was originally generated
from this file but has since been edited by hand (payment states, calendar slot
fields, join/accept bodies). **Don't regenerate it**: it would overwrite those
changes. Update the spec, the client and `extras.ts` together when an endpoint changes.

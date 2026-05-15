# api.bondarewicz.com

A small playground API: UUIDs, haiku names, base64 helpers, HTTP verb/status echoes, an in-memory key-value store, file upload, replay queue, configurable delay.

## Docs

Interactive Swagger UI lives at the API root:

- Production: https://api.bondarewicz.com/v1/
- Local: http://localhost:8080/v1/

[![Run in Postman](https://run.pstmn.io/button.svg)](https://app.getpostman.com/run-collection/2c19f5b3298aa50db70d)

## Run locally

```sh
npm install
PORT=8080 npm run dev
```

## Limits

Rate limited to 1000 requests per hour per IP.

## Notes

`/anythings/:id` and `/replay` are backed by in-memory state — data does not survive a process restart.

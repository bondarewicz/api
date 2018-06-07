## `GET /get`

### Response

```json
200
```

## `POST /post`

### Response

```json
201
```

## `PUT /put`

### Response

```json
202
```

## `PATCH /patch`

### Response

```json
202
```

## `DELETE /delete`

### Response

```json
204
```

## `GET /status/:code`
## `POST /status/:code`
## `PUT /status/:code`
## `PATCH /status/:code`
## `DELETE /status/:code`

### Request

```json
GET https://api.bondarewicz.com/status/200
```

### Response

```json
200
```

## `POST /anything/:id`

### Request

```json
POST https://api.bondarewicz.com/anything/815a99d0-ad89-467b-ad58-7b9571bf587b

{
  "test":"qwerty"
}
```

### Response

```json
{
  "id": "815a99d0-ad89-467b-ad58-7b9571bf587b",
  "test": "qwerty",
  "links": {
    "get": "https://api.bondarewicz.com/anything/815a99d0-ad89-467b-ad58-7b9571bf587b",
    "post": "https://api.bondarewicz.com/anything/815a99d0-ad89-467b-ad58-7b9571bf587b",
    "put": "https://api.bondarewicz.com/anything/815a99d0-ad89-467b-ad58-7b9571bf587b",
    "delete": "https://api.bondarewicz.com/anything/815a99d0-ad89-467b-ad58-7b9571bf587b"
  }
}
```

## `GET /anything/:id`

### Request

```json
GET https://api.bondarewicz.com/anything/815a99d0-ad89-467b-ad58-7b9571bf587b
```

### Response

```json
{
  "id": "815a99d0-ad89-467b-ad58-7b9571bf587b",
  "test": "qwerty",
  "links": {
    "get": "https://api.bondarewicz.com/anything/815a99d0-ad89-467b-ad58-7b9571bf587b",
    "post": "https://api.bondarewicz.com/anything/815a99d0-ad89-467b-ad58-7b9571bf587b",
    "put": "https://api.bondarewicz.com/anything/815a99d0-ad89-467b-ad58-7b9571bf587b",
    "delete": "https://api.bondarewicz.com/anything/815a99d0-ad89-467b-ad58-7b9571bf587b"
  }
}
```

## `PUT /anything:/id`

### Request

```json
PUT https://api.bondarewicz.com/anything/815a99d0-ad89-467b-ad58-7b9571bf587b

{
  "test": "qwerty",
  "hello": "world",
}
```

### Response

```json
{
  "id": "815a99d0-ad89-467b-ad58-7b9571bf587b",
  "test": "qwerty",
  "hello": "world",
  "links": {
    "get": "https://api.bondarewicz.com/anything/815a99d0-ad89-467b-ad58-7b9571bf587b",
    "post": "https://api.bondarewicz.com/anything/815a99d0-ad89-467b-ad58-7b9571bf587b",
    "put": "https://api.bondarewicz.com/anything/815a99d0-ad89-467b-ad58-7b9571bf587b",
    "delete": "https://api.bondarewicz.com/anything/815a99d0-ad89-467b-ad58-7b9571bf587b"
  }
}
```

## `DELETE /anything/:id`

### Request

```json
DELETE https://api.bondarewicz.com/anything/815a99d0-ad89-467b-ad58-7b9571bf587b
```

### Response

```json
204
```

## `GET /hello`

### Request

```json
GET https://api.bondarewicz.com/hello
```

### Response

```json
"Happy Wednesday!"
```

## `GET /uuid`

### Request

```json
GET https://api.bondarewicz.com/uuid
```

### Response

```json
"18cdf4f7-8620-48ac-b699-40e0b4670eb7"
```

## `GET /ref`

### Request

```json
GET https://api.bondarewicz.com/ref
```

### Response

```json
"HJMh91QRjopYUCp1szJQPtu19De0GdxgY6pE"
```

## `GET /haiku`

### Request

```json
GET https://api.bondarewicz.com/haiku
```

### Response

```json
"little-haze-5209"
```

## `GET /sprint`

### Request

```json
GET https://api.bondarewicz.com/sprint
```

### Response

```json
"2018W23"
```

## `GET /hex`

### Request

```json
GET https://api.bondarewicz.com/hex
```

### Response

```json
"#561da1"
```

## `GET /ip`

### Request

```json
GET https://api.bondarewicz.com/ip
```

### Response

```json
"109.282.239.199"
```

## `GET /ua`

### Request

```json
GET https://api.bondarewicz.com/ua
```

### Response

```json
{
  "ua": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_13_4) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/67.0.3396.62 Safari/537.36",
  "browser": "Chrome 67.0.3396.62",
  "engine": "WebKit 537.36",
  "os": "Mac OS 10.13.4",
  "device": ""
}
```

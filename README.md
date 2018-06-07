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

## `GET /statuses/`

### Request
```json
GET https://api.bondarewicz.com/statuses
```

### Response

```json
{
  "codes": [
      {
          "101": "Switching Protocols"
      },
      {
          "200": "OK"
      },
      {
          "201": "Created"
      },
      {
          "202": "Accepted"
      },
      {
          "203": "Non-authoritative Information"
      },
      {
          "204": "No Content"
      },
      {
          "205": "Reset Content"
      },
      {
          "206": "Partial Content"
      },
      {
          "207": "Multi-Status"
      },
      {
          "208": "Already Reported"
      },
      {
          "226": "IM Used"
      },
      {
          "300": "Multiple Choices"
      },
      {
          "301": "Moved Permanently"
      },
      {
          "302": "Found"
      },
      {
          "303": "See Other"
      },
      {
          "304": "Not Modified"
      },
      {
          "305": "Use Proxy"
      },
      {
          "307": "Temporary Redirect"
      },
      {
          "308": "Permanent Redirect"
      },
      {
          "400": "Bad Request"
      },
      {
          "401": "Unauthorized"
      },
      {
          "402": "Payment Required"
      },
      {
          "403": "Forbidden"
      },
      {
          "404": "Not Found"
      },
      {
          "405": "Method Not Allowed"
      },
      {
          "406": "Not Acceptable"
      },
      {
          "407": "Proxy Authentication Required"
      },
      {
          "408": "Request Timeout"
      },
      {
          "409": "Conflict"
      },
      {
          "410": "Gone"
      },
      {
          "411": "Length Required"
      },
      {
          "412": "Precondition Failed"
      },
      {
          "413": "Payload Too Large"
      },
      {
          "414": "Request-URI Too Long"
      },
      {
          "415": "Unsupported Media Type"
      },
      {
          "416": "Requested Range Not Satisfiable"
      },
      {
          "417": "Expectation Failed"
      },
      {
          "418": "I\"m a teapot"
      },
      {
          "421": "Misdirected Request"
      },
      {
          "422": "Unprocessable Entity"
      },
      {
          "423": "Locked"
      },
      {
          "424": "Failed Dependency"
      },
      {
          "426": "Upgrade Required"
      },
      {
          "428": "Precondition Required"
      },
      {
          "429": "Too Many Requests"
      },
      {
          "431": "Request Header Fields Too Large"
      },
      {
          "444": "Connection Closed Without Response"
      },
      {
          "451": "Unavailable For Legal Reasons"
      },
      {
          "500": "Internal Server Error"
      },
      {
          "501": "Not Implemented"
      },
      {
          "502": "Bad Gateway"
      },
      {
          "503": "Service Unavailable"
      },
      {
          "504": "Gateway Timeout"
      },
      {
          "505": "HTTP Version Not Supported"
      },
      {
          "506": "Variant Also Negotiates"
      },
      {
          "507": "Insufficient Storage"
      },
      {
          "508": "Loop Detected"
      },
      {
          "510": "Not Extended"
      },
      {
          "511": "Network Authentication Required"
      }
  ],
  "links": {
      "101": "http://localhost:8080/status/101",
      "200": "http://localhost:8080/status/200",
      "201": "http://localhost:8080/status/201",
      "202": "http://localhost:8080/status/202",
      "203": "http://localhost:8080/status/203",
      "204": "http://localhost:8080/status/204",
      "205": "http://localhost:8080/status/205",
      "206": "http://localhost:8080/status/206",
      "207": "http://localhost:8080/status/207",
      "208": "http://localhost:8080/status/208",
      "226": "http://localhost:8080/status/226",
      "300": "http://localhost:8080/status/300",
      "301": "http://localhost:8080/status/301",
      "302": "http://localhost:8080/status/302",
      "303": "http://localhost:8080/status/303",
      "304": "http://localhost:8080/status/304",
      "305": "http://localhost:8080/status/305",
      "307": "http://localhost:8080/status/307",
      "308": "http://localhost:8080/status/308",
      "400": "http://localhost:8080/status/400",
      "401": "http://localhost:8080/status/401",
      "402": "http://localhost:8080/status/402",
      "403": "http://localhost:8080/status/403",
      "404": "http://localhost:8080/status/404",
      "405": "http://localhost:8080/status/405",
      "406": "http://localhost:8080/status/406",
      "407": "http://localhost:8080/status/407",
      "408": "http://localhost:8080/status/408",
      "409": "http://localhost:8080/status/409",
      "410": "http://localhost:8080/status/410",
      "411": "http://localhost:8080/status/411",
      "412": "http://localhost:8080/status/412",
      "413": "http://localhost:8080/status/413",
      "414": "http://localhost:8080/status/414",
      "415": "http://localhost:8080/status/415",
      "416": "http://localhost:8080/status/416",
      "417": "http://localhost:8080/status/417",
      "418": "http://localhost:8080/status/418",
      "421": "http://localhost:8080/status/421",
      "422": "http://localhost:8080/status/422",
      "423": "http://localhost:8080/status/423",
      "424": "http://localhost:8080/status/424",
      "426": "http://localhost:8080/status/426",
      "428": "http://localhost:8080/status/428",
      "429": "http://localhost:8080/status/429",
      "431": "http://localhost:8080/status/431",
      "444": "http://localhost:8080/status/444",
      "451": "http://localhost:8080/status/451",
      "500": "http://localhost:8080/status/500",
      "501": "http://localhost:8080/status/501",
      "502": "http://localhost:8080/status/502",
      "503": "http://localhost:8080/status/503",
      "504": "http://localhost:8080/status/504",
      "505": "http://localhost:8080/status/505",
      "506": "http://localhost:8080/status/506",
      "507": "http://localhost:8080/status/507",
      "508": "http://localhost:8080/status/508",
      "510": "http://localhost:8080/status/510",
      "511": "http://localhost:8080/status/511"
  }
}
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

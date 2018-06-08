## `GET /encode64/:value`

### Request

```json
GET https://api.bondarewicz.com/v1/encode64/qwerty
```

### Response

```json
{
  "base64": "cXdlcnR5",
  "links": {
    "decode": "https://api.bondarewicz.com/v1/decode64/cXdlcnR5"
  }
}
```
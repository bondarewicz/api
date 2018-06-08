## `GET /decode64/:value`

### Request

```json
GET https://api.bondarewicz.com/v1/decode64/cXdlcnR5
```

### Response

```json
{
  "text": "qwerty",
  "links": {
    "encode": "https://api.bondarewicz.com/v1/encode64/qwerty"
  }
}
```
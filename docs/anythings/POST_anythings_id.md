## `POST /anythings/:id`

### Request

```json
POST https://api.bondarewicz.com/v1/anythings/1eCTngVs

{
  "hello":"world"
}
```

### Response

```json
{
  "hello": "world"
}
```

### Errors

```json
{
  "status": "409",
  "title": "Anything with the same id already exists.",
  "detail": "Use DELETE https://api.bondarewicz.com/v1/anythings/1eCTngVs first then try again or simply use PUT https://api.bondarewicz.com/v1/anythings/1eCTngVs instead."
}
```
## `GET /statuses`

### Request

```json
GET https://api.bondarewicz.com/v1/statuses
```

### Response

```json
{
  "statuses": [{
      "code": "101",
      "title": "Switching Protocols",
      "description": "The initial part of a request has been received and has not yet been rejected by the server. The server intends to send a final response after the request has been fully received and acted upon.",
      "link": "https://api.bondarewicz.com/v1/statuses/101"
    },
    {
      "code": "200",
      "title": "OK",
      "description": "The 200 (OK) status code indicates that the request has succeeded. The payload sent in a 200 response depends on the request method.",
      "link": "https://api.bondarewicz.com/v1/statuses/200"
    },
    {
      "code": "201",
      "title": "Created",
      "description": "The request has been fulfilled and has resulted in one or more new resources being created.",
      "link": "https://api.bondarewicz.com/v1/statuses/201"
    }
    ...
  ]
}
```
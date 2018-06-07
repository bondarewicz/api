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
  "statuses": [{
      "code": "101",
      "title": "Switching Protocols",
      "description": "The initial part of a request has been received and has not yet been rejected by the server. The server intends to send a final response after the request has been fully received and acted upon.",
      "link": "http://localhost:8080/status/101"
    },
    {
      "code": "200",
      "title": "OK",
      "description": "The 200 (OK) status code indicates that the request has succeeded. The payload sent in a 200 response depends on the request method.",
      "link": "http://localhost:8080/status/200"
    },
    {
      "code": "201",
      "title": "Created",
      "description": "The request has been fulfilled and has resulted in one or more new resources being created.",
      "link": "http://localhost:8080/status/201"
    },
    {
      "code": "202",
      "title": "Accepted",
      "description": "The request has been accepted for processing, but the processing has not been completed. The request might or might not eventually be acted upon, as it might be disallowed when processing actually takes place.",
      "link": "http://localhost:8080/status/202"
    },
    {
      "code": "203",
      "title": "Non-authoritative Information",
      "description": "The request was successful but the enclosed payload has been modified from that of the origin server's 200 OK response by a transforming proxy.",
      "link": "http://localhost:8080/status/203"
    },
    {
      "code": "204",
      "title": "No Content",
      "description": "The server has successfully fulfilled the request and that there is no additional content to send in the response payload body.",
      "link": "http://localhost:8080/status/204"
    },
    {
      "code": "205",
      "title": "Reset Content",
      "description": "The server has fulfilled the request and desires that the user agent reset the \"document view\", which caused the request to be sent, to its original state as received from the origin server.",
      "link": "http://localhost:8080/status/205"
    },
    {
      "code": "206",
      "title": "Partial Content",
      "description": "The server is successfully fulfilling a range request for the target resource by transferring one or more parts of the selected representation that correspond to the satisfiable ranges found in the request's Range header field.",
      "link": "http://localhost:8080/status/206"
    },
    {
      "code": "207",
      "title": "Multi-Status",
      "description": "A Multi-Status response conveys information about multiple resources in situations where multiple status codes might be appropriate.",
      "link": "http://localhost:8080/status/207"
    },
    {
      "code": "208",
      "title": "Already Reported",
      "description": "Used inside a DAV: propstat response element to avoid enumerating the internal members of multiple bindings to the same collection repeatedly.",
      "link": "http://localhost:8080/status/208"
    },
    {
      "code": "226",
      "title": "IM Used",
      "description": "The server has fulfilled a GET request for the resource, and the response is a representation of the result of one or more instance-manipulations applied to the current instance.",
      "link": "http://localhost:8080/status/226"
    },
    {
      "code": "300",
      "title": "Multiple Choices",
      "description": "The target resource has more than one representation, each with its own more specific identifier, and information about the alternatives is being provided so that the user (or user agent) can select a preferred representation by redirecting its request to one or more of those identifiers.",
      "link": "http://localhost:8080/status/300"
    },
    {
      "code": "301",
      "title": "Moved Permanently",
      "description": "The target resource has been assigned a new permanent URI and any future references to this resource ought to use one of the enclosed URIs.",
      "link": "http://localhost:8080/status/301"
    },
    {
      "code": "302",
      "title": "Found",
      "description": "The target resource resides temporarily under a different URI. Since the redirection might be altered on occasion, the client ought to continue to use the effective request URI for future requests.",
      "link": "http://localhost:8080/status/302"
    },
    {
      "code": "303",
      "title": "See Other",
      "description": "The server is redirecting the user agent to a different resource, as indicated by a URI in the Location header field, which is intended to provide an indirect response to the original request.",
      "link": "http://localhost:8080/status/303"
    },
    {
      "code": "304",
      "title": "Not Modified",
      "description": "A conditional GET or HEAD request has been received and would have resulted in a 200 OK response if it were not for the fact that the condition evaluated to false.",
      "link": "http://localhost:8080/status/304"
    },
    {
      "code": "305",
      "title": "Use Proxy",
      "description": "Defined in a previous version of this specification and is now deprecated, due to security concerns regarding in-band configuration of a proxy.",
      "link": "http://localhost:8080/status/305"
    },
    {
      "code": "307",
      "title": "Temporary Redirect",
      "description": "The target resource resides temporarily under a different URI and the user agent MUST NOT change the request method if it performs an automatic redirection to that URI.",
      "link": "http://localhost:8080/status/307"
    },
    {
      "code": "308",
      "title": "Permanent Redirect",
      "description": "The target resource has been assigned a new permanent URI and any future references to this resource ought to use one of the enclosed URIs.",
      "link": "http://localhost:8080/status/308"
    },
    {
      "code": "400",
      "title": "Bad Request",
      "description": "The server cannot or will not process the request due to something that is perceived to be a client error (e.g., malformed request syntax, invalid request message framing, or deceptive request routing).",
      "link": "http://localhost:8080/status/400"
    },
    {
      "code": "401",
      "title": "Unauthorized",
      "description": "The request has not been applied because it lacks valid authentication credentials for the target resource.",
      "link": "http://localhost:8080/status/401"
    },
    {
      "code": "402",
      "title": "Payment Required",
      "description": "Reserved for future use.",
      "link": "http://localhost:8080/status/402"
    },
    {
      "code": "403",
      "title": "Forbidden",
      "description": "The server understood the request but refuses to authorize it.",
      "link": "http://localhost:8080/status/403"
    },
    {
      "code": "404",
      "title": "Not Found",
      "description": "The origin server did not find a current representation for the target resource or is not willing to disclose that one exists.",
      "link": "http://localhost:8080/status/404"
    },
    {
      "code": "405",
      "title": "Method Not Allowed",
      "description": "The method received in the request-line is known by the origin server but not supported by the target resource.",
      "link": "http://localhost:8080/status/405"
    },
    {
      "code": "406",
      "title": "Not Acceptable",
      "description": "The target resource does not have a current representation that would be acceptable to the user agent, according to the proactive negotiation header fields received in the request, and the server is unwilling to supply a default representation.",
      "link": "http://localhost:8080/status/406"
    },
    {
      "code": "407",
      "title": "Proxy Authentication Required",
      "description": "Similar to 401 Unauthorized, but it indicates that the client needs to authenticate itself in order to use a proxy.",
      "link": "http://localhost:8080/status/407"
    },
    {
      "code": "408",
      "title": "Request Timeout",
      "description": "The server did not receive a complete request message within the time that it was prepared to wait.",
      "link": "http://localhost:8080/status/408"
    },
    {
      "code": "409",
      "title": "Conflict",
      "description": "The request could not be completed due to a conflict with the current state of the target resource. This code is used in situations where the user might be able to resolve the conflict and resubmit the request.",
      "link": "http://localhost:8080/status/409"
    },
    {
      "code": "410",
      "title": "Gone",
      "description": "The target resource is no longer available at the origin server and that this condition is likely to be permanent.",
      "link": "http://localhost:8080/status/410"
    },
    {
      "code": "411",
      "title": "Length Required",
      "description": "The server refuses to accept the request without a defined Content-Length.",
      "link": "http://localhost:8080/status/411"
    },
    {
      "code": "412",
      "title": "Precondition Failed",
      "description": "One or more conditions given in the request header fields evaluated to false when tested on the server.",
      "link": "http://localhost:8080/status/412"
    },
    {
      "code": "413",
      "title": "Payload Too Large",
      "description": "The server is refusing to process a request because the request payload is larger than the server is willing or able to process.",
      "link": "http://localhost:8080/status/413"
    },
    {
      "code": "414",
      "title": "Request-URI Too Long",
      "description": "The server is refusing to service the request because the request-target is longer than the server is willing to interpret.",
      "link": "http://localhost:8080/status/414"
    },
    {
      "code": "415",
      "title": "Unsupported Media Type",
      "description": "The origin server is refusing to service the request because the payload is in a format not supported by this method on the target resource.",
      "link": "http://localhost:8080/status/415"
    },
    {
      "code": "416",
      "title": "Requested Range Not Satisfiable",
      "description": "None of the ranges in the request's Range header field overlap the current extent of the selected resource or that the set of ranges requested has been rejected due to invalid ranges or an excessive request of small or overlapping ranges.",
      "link": "http://localhost:8080/status/416"
    },
    {
      "code": "417",
      "title": "Expectation Failed",
      "description": "The expectation given in the request's Expect header field could not be met by at least one of the inbound servers.",
      "link": "http://localhost:8080/status/417"
    },
    {
      "code": "418",
      "title": "I\"m a teapot",
      "description": "Any attempt to brew coffee with a teapot should result in the error code \"418 I'm a teapot\". The resulting entity body MAY be short and stout.",
      "link": "http://localhost:8080/status/418"
    },
    {
      "code": "421",
      "title": "Misdirected Request",
      "description": "The request was directed at a server that is not able to produce a response. This can be sent by a server that is not configured to produce responses for the combination of scheme and authority that are included in the request URI.",
      "link": "http://localhost:8080/status/421"
    },
    {
      "code": "422",
      "title": "Unprocessable Entity",
      "description": "The server understands the content type of the request entity (hence a 415 Unsupported Media Type status code is inappropriate), and the syntax of the request entity is correct (thus a 400 Bad Request status code is inappropriate) but was unable to process the contained instructions.",
      "link": "http://localhost:8080/status/422"
    },
    {
      "code": "423",
      "title": "Locked",
      "description": "The source or destination resource of a method is locked.",
      "link": "http://localhost:8080/status/423"
    },
    {
      "code": "424",
      "title": "Failed Dependency",
      "description": "The method could not be performed on the resource because the requested action depended on another action and that action failed.",
      "link": "http://localhost:8080/status/424"
    },
    {
      "code": "426",
      "title": "Upgrade Required",
      "description": "The server refuses to perform the request using the current protocol but might be willing to do so after the client upgrades to a different protocol.",
      "link": "http://localhost:8080/status/426"
    },
    {
      "code": "428",
      "title": "Precondition Required",
      "description": "The origin server requires the request to be conditional.",
      "link": "http://localhost:8080/status/428"
    },
    {
      "code": "429",
      "title": "Too Many Requests",
      "description": "The user has sent too many requests in a given amount of time (\"rate limiting\").",
      "link": "http://localhost:8080/status/429"
    },
    {
      "code": "431",
      "title": "Request Header Fields Too Large",
      "description": "The server is unwilling to process the request because its header fields are too large. The request MAY be resubmitted after reducing the size of the request header fields.",
      "link": "http://localhost:8080/status/431"
    },
    {
      "code": "444",
      "title": "Connection Closed Without Response",
      "description": "A non-standard status code used to instruct nginx to close the connection without sending a response to the client, most commonly used to deny malicious or malformed requests.",
      "link": "http://localhost:8080/status/444"
    },
    {
      "code": "451",
      "title": "Unavailable For Legal Reasons",
      "description": "The server is denying access to the resource as a consequence of a legal demand.",
      "link": "http://localhost:8080/status/451"
    },
    {
      "code": "500",
      "title": "Internal Server Error",
      "description": "The server encountered an unexpected condition that prevented it from fulfilling the request.",
      "link": "http://localhost:8080/status/500"
    },
    {
      "code": "501",
      "title": "Not Implemented",
      "description": "The server does not support the functionality required to fulfill the request.",
      "link": "http://localhost:8080/status/501"
    },
    {
      "code": "502",
      "title": "Bad Gateway",
      "description": "The server, while acting as a gateway or proxy, received an invalid response from an inbound server it accessed while attempting to fulfill the request.",
      "link": "http://localhost:8080/status/502"
    },
    {
      "code": "503",
      "title": "Service Unavailable",
      "description": "The server is currently unable to handle the request due to a temporary overload or scheduled maintenance, which will likely be alleviated after some delay.",
      "link": "http://localhost:8080/status/503"
    },
    {
      "code": "504",
      "title": "Gateway Timeout",
      "description": "The server, while acting as a gateway or proxy, did not receive a timely response from an upstream server it needed to access in order to complete the request.",
      "link": "http://localhost:8080/status/504"
    },
    {
      "code": "505",
      "title": "HTTP Version Not Supported",
      "description": "The server does not support, or refuses to support, the major version of HTTP that was used in the request message.",
      "link": "http://localhost:8080/status/505"
    },
    {
      "code": "506",
      "title": "Variant Also Negotiates",
      "description": "The server has an internal configuration error: the chosen variant resource is configured to engage in transparent content negotiation itself, and is therefore not a proper end point in the negotiation process.",
      "link": "http://localhost:8080/status/506"
    },
    {
      "code": "507",
      "title": "Insufficient Storage",
      "description": "The method could not be performed on the resource because the server is unable to store the representation needed to successfully complete the request.",
      "link": "http://localhost:8080/status/507"
    },
    {
      "code": "508",
      "title": "Loop Detected",
      "description": "The server terminated an operation because it encountered an infinite loop while processing a request with \"Depth: infinity\". This status indicates that the entire operation failed.",
      "link": "http://localhost:8080/status/508"
    },
    {
      "code": "510",
      "title": "Not Extended",
      "description": "The policy for accessing the resource has not been met in the request. The server should send back all the information necessary for the client to issue an extended request.",
      "link": "http://localhost:8080/status/510"
    },
    {
      "code": "511",
      "title": "Network Authentication Required",
      "description": "The client needs to authenticate to gain network access.",
      "link": "http://localhost:8080/status/511"
    }
  ]
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

# Forward HTTP/HTTPS Proxy Agent

This an HTTP/HTTPS proxy agent capable of forward proxying HTTP/HTTPS requests.

It supports the following:
* Connect to a proxy with a regular socket or SSL/TLS socket
* Proxying to a remote server using SSL tunneling (via the http CONNECT method)
* Authenticate with a proxy with Basic authentication
* Authenticate with a proxy with NTLM authentication (experimental). Depends on ``node-ntlm``

The agent inherits directly from the ``http.Agent`` Node object so it benefits from all
the socket handling goodies that come with it.

## Installation

    npm install proxying-agent

## Usage

```javascript
  var proxying = require('proxying-agent');
  var proxyingOptions = {
    proxy: 'http://username:password@proxy.example.com:8080',
    server: 'https://server.example.com:443'
  };
  var proxyingAgent = new proxying.ProxyingAgent(proxyingOptions);
  var req = https.request({
    host: 'example.com',
    port: 443,
    agent: proxyingAgent
  });
```

The following options are supported:

* ``proxy`` - Specifies the proxy url. The supported format is ``http[s]://[auth@]host:port`` where ``auth``
    is the authentication information in the form of ``username:password``. The authentication information can also be
    in the form of a Base64 encoded ``user:password``, e.g. ``http://dXNlcm5hbWU6cGFzc3dvcmQ=@proxy.example.com:8080``
* ``server`` - the target server the proxy will connect to. This is primarily used to determine if the proxy should
    be a tunneling proxy, which will only be true if the target server protocol is https
* ``ntlm`` - (experimental) connect to the proxy using NTLM authentication. ``ntlm`` is expected to contain the
    following fields:
    * ``hostname`` - the local machine hostname
    * ``domain`` - the NTLM domain
    * ``username`` - the NTLM username
    * ``password`` - the NTLM password


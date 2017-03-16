<div align="center"><img src="https://capriza.github.io/images/logos/logos-bird.svg" height="128" /></div>

Node HTTP/HTTPS Forward Proxy Agent
===

This ia a fork of https://github.com/capriza/node-proxying-agent

Goals (WIP):

1. Address compatibilty issues with <a href="https://github.com/request/request">request</a> library:

It should be possible to do the following:

```javascript
  let request = require('request');
  let proxyingAgent = require('proxying-agent').create('http://user:123456@myproxy'}, 'http://....');

  request({
       url: 'http://www.example.com',
       method:'GET',
       agent: proxyingAgent
   },(err, res, body)=>{
            ....
  })
```

However, it fails with original 'proxying-agent'.

2. Make sure the above scenario is transparent to the user regardless of authType.

3. Expose ProxyingAgent class in order to allow extensions.

4. Implement KeepAlive for NTLM connections and other protocol related options.


See original documentaiton below.

Node HTTP/HTTPS Forward Proxy Agent
===

This a Node http agent capable of forward proxying HTTP/HTTPS requests.

It supports the following:
* Connect to a proxy with either HTTP or HTTPS
* Proxying to a remote server using SSL tunneling (via the http CONNECT method)
* Authenticate with a proxy with Basic authentication
* Authenticate with a proxy with NTLM authentication (beta)

The agent inherits directly from the ``http.Agent`` Node object so it benefits from all
the socket handling goodies that come with it.

## Installation

    npm install proxying-agent

## Usage

### create(options, target)

Returns a new agent configured correctly to proxy to the specified target.

* `options` - (string|object) proxy url string or object with the following options:
  * `proxy` - Specifies the proxy url. The supported format is `http[s]://[auth@]host:port` where `auth`
    is the authentication information in the form of `username:password`. The authentication information can also be
    in the form of a Base64 encoded `user:password`, e.g. `http://dXNlcm5hbWU6cGFzc3dvcmQ=@proxy.example.com:8080`.
    if the username for NTLM needs to be in the `domain\username` format, specify `domain%5Cusername` instead. 
  * `tlsOptions` - TLS connection options to use when the target server protocol is `https`. See http://nodejs.org/api/tls.html#tls_tls_connect_options_callback for a list of available options.
  * `authType` - Proxy authentication type. Possible values are `basic` and `ntlm` (default is `basic`).
  * `ntlm` - (beta) applicable only if `authType` is `ntlm`. Supported fields:
    * `domain` (required) - the NTLM domain
    * `workstation` (optional) - the local machine hostname (os.hostname() is not specified)
* `target` - the target url that the agent is to proxy

### HTTP Server

```javascript
  var proxyingAgent = require('proxying-agent').create('http://proxy.example.com:8080', 'http://example.com');
  var req = http.request({
    host: 'example.com',
    port: 80,
    agent: proxyingAgent
  });
```

### HTTPS Server

```javascript
  var proxyingAgent = require('proxying-agent').create('http://proxy.example.com:8080', 'https://example.com');
  var req = https.request({
    host: 'example.com',
    port: 443,
    agent: proxyingAgent
  });
```

### Basic Authentication

```javascript
  var proxyingAgent = require('proxying-agent').create('http://username:password@proxy.example.com:8080', 'https://example.com');
  var req = https.request({
    host: 'example.com',
    port: 443,
    agent: proxyingAgent
  });
```

### NTLM Authentication

When authenticating using NTLM it is important to delay sending the request data until the socket is assigned to the request.
Failing to do so will result in the socket being prematurely closed, preventing the NTLM handshake from completing.

```javascript
  var proxyOptions = {
    proxy: 'http://username:password@proxy.example.com:8080',
    authType: 'ntlm',
    ntlm: {
      domain: 'MYDOMAIN'
    }
  };
  var proxyingAgent = require('proxying-agent').create(proxyOptions, 'https://example.com');
  var req = https.request({
    host: 'example.com',
    port: 443,
    agent: proxyingAgent
  });

  req.on('socket', function(socket) {
    req.write('DATA');
    req.end();
  });
```

## References

* NTLM code was forked from https://github.com/SamDecrock/node-http-ntlm.git
* NTLM Authentication Scheme for HTTP - http://www.innovation.ch/personal/ronald/ntlm.html

## Copyright and License

Copyright 2016 Capriza. Code released under the [MIT license](LICENSE.md)

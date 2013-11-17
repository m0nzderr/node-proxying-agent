'use strict';

var url = require('url');
var http = require('http');
var https = require('https');
var tls = require('tls');
var util = require('util');
var ntlm = require('ntlm');

function ProxyingAgent(options) {
  this.openSockets = {};
  this.options = util._extend({}, options);
  this.options.proxy = url.parse(this.options.proxy);
  this.options.tunnel = this.options.tunnel || false;
  this.options.ssl = this.options.proxy.protocol ? this.options.proxy.protocol.toLowerCase() == 'https:' : false;
  this.options.host = this.options.proxy.hostname;
  this.options.port = this.options.proxy.port || (this.options.ssl ? 443 : 80);

  // select the Agent type to use based on the proxy protocol
  if (this.options.ssl) {
    this.agent = https.Agent;
    this.options.agent = https.globalAgent;
  } else {
    this.agent = http.Agent;
    this.options.agent = http.globalAgent;
  }
  this.agent.call(this, this.options);
}
util.inherits(ProxyingAgent, http.Agent);

/**
 * Overrides the 'addRequest' Agent method for establishing a socket with the proxy
 * that will e used to issue the actual request
 * @param req
 * @param host
 * @param port
 * @param localAddress
 */
ProxyingAgent.prototype.addRequest = function(req, host, port, localAddress) {
  if (this.options.ntlm) {
    this.startNtlm(req, host, port, localAddress);
  } else {
    this.startProxying(req, host, port, localAddress);
  }
};

/**
 * Start proxying the request through the proxy server.
 * This automatically opens a tunnel through the proxy if needed,
 * or just issues a regular request for the proxy to transfer
 * @param req
 * @param host
 * @param port
 * @param localAddress
 */
ProxyingAgent.prototype.startProxying = function(req, host, port, localAddress) {

  // setup the authorization header for the proxy
  if (this.options.proxy.auth) {
    var auth = this.options.proxy.auth;
    // if there is no colon then assume that the auth is a base64 encoded username:password
    if (auth.indexOf(':') == -1) {
      auth = new Buffer(auth, 'base64').toString('ascii');
      // if after decoding there still isn't a colon, then revert back to the original value
      if (auth.indexOf(':') == -1) {
        auth = this.options.proxy.auth;
      }
    }
    this.authHeader = {
      header: 'Proxy-Authorization',
      value: 'Basic ' + new Buffer(auth).toString('base64')
    }
  }

  // if we need to create a tunnel to the server via the CONNECT method
  if (this.options.tunnel) {
    var tunnelOptions = util._extend({}, this.options);
    tunnelOptions.method = 'CONNECT';
    tunnelOptions.path = host+':'+port;

    // if we already have a socket open then execute the CONNECT method on it
    var socket = this.getSocket(req);
    if (socket) {
      tunnelOptions.agent = new SocketAgent(socket);
    }

    // create a new CONNECT request to the proxy to create the tunnel
    // to the server
    var newReq = this.createNewRequest(tunnelOptions);
    if (this.authHeader) {
      newReq.setHeader(this.authHeader.header, this.authHeader.value);
    }
    // listen for the CONNECT event to complete and execute the original request
    // on the TLSed socket
    newReq.on('connect', function(response, socket, head) {
      var tlsOptions = {
        socket: socket,
        servername: host
      }
      // upgrade the socket to TLS
      var tlsSocket = tls.connect(tlsOptions, function() {
        this.setSocket(req, tlsSocket);
        this.execRequest(req, this.options.host, this.options.port, localAddress);
      }.bind(this));
    }.bind(this));
    // execute the CONNECT method to create the tunnel
    newReq.end();
  } else {
    // issue a regular proxy request
    var protocol = this.options.ssl ? 'https://' : 'http://';
    req.path = protocol+host+':'+port+req.path
    if (this.authHeader) {
      req.setHeader(this.authHeader.header, this.authHeader.value);
    }
    this.execRequest(req, this.options.host, this.options.port, localAddress);
  }
}

/**
 * Start an NTLM authentication process. The result is an open socket that will be used
 * to issue the actual request or open a tunnel on
 *
 * @param req
 * @param host
 * @param port
 * @param localAddress
 */
ProxyingAgent.prototype.startNtlm = function(req, host, port, localAddress) {
  var ntlmOptions = util._extend({}, this.options);
  ntlmOptions.method = ntlmOptions.method || 'GET'; // just for the NTLM handshake

  // set the NTLM type 1 message header
  ntlmOptions.headers['Authorization'] = ntlm.challengeHeader(ntlmOptions.ntlm.hostname, ntlmOptions.ntlm.domain);

  // create the NTLM type 1 request
  var newReq = this.createNewRequest(ntlmOptions);

  // capture the socket
  newReq.on('socket', function(socket) {
    this.setSocket(req, socket);
  });

  // capture the response and set the NTLM type 3 authorization header
  // that will be used when issuing the actual request
  newReq.on('response', function(response) {
    if (!response.statusCode == 401 || !response.getHeader('WWW-Authenticate')) {
      this.emitError(req, 'did not receive NTLM type 2 message');
    }
    this.authHeader = {
      header: 'Authorization',
      value: ntlm.responseHeader(response, req.path,
        ntlmOptions.ntlm.domain, ntlmOptions.ntlm.username, ntlmOptions.ntlm.password)
    }

    // start proxying the actual request.
    // te socket should have already been captured and associated with the request
    this.startProxying(req, host, port, localAddress);
  });

  // issue the NTLM type 1 request
  newReq.end();
}

/**
 * Create a new request instance according the needed security
 * @param options
 * @returns {*}
 */
ProxyingAgent.prototype.createNewRequest = function(options) {
  if (options.ssl) {
    return new https.request(options);
  }
  return new http.request(options);
}

/**
 * Execute the provided request by invoking the original Agent 'addRequest' method.
 * If there is already a socket that was associated with the request, then it
 * will be used for issuing the request (via the 'createSocket' method)
 *
 * @param req
 * @param host
 * @param port
 * @param localAddress
 */
ProxyingAgent.prototype.execRequest = function(req, host, port, localAddress) {
  this.agent.prototype.addRequest.call(this, req, host, port, localAddress);

  // if there is an associated socket to this request then the association is removed
  // since the socket was already passed to the request
  if (this.openSockets[req]) {
    delete this.openSockets[req];
  }
}
/**
 * Remember a socket and associate it with a specific request.
 * When the 'createSocket' method will be called to execute the actual request
 * then the already existing socket will be used
 * @param req
 * @param socket
 */
ProxyingAgent.prototype.setSocket = function(req, socket) {
  var self = this;
  this.openSockets[req] = socket;
  var onClose = function() {
    if (self.openSockets[req]) {
      delete self.openSockets[req];
    }
  };
  this.openSockets[req].on('close', onClose);
}

ProxyingAgent.prototype.getSocket = function(req) {
  return this.openSockets[req];
}

/**
 * This is called during the 'addRequest' call of the original Agent to return a
 * new socket for executing the request. If a socket already exists then it is used
 * instead of creating a new one.
 * @param name
 * @param host
 * @param port
 * @param localAddress
 * @param req
 * @returns {*}
 */
ProxyingAgent.prototype.createSocket = function(name, host, port, localAddress, req) {
  if (this.openSockets[req]) {
    return this.openSockets[req];
  }
  return this.agent.prototype.createSocket.call(this, name, host, port, localAddress, req);
}

ProxyingAgent.prototype.emitError = function(req, message) {
  req.emit('error', new Error(message));
}


//======= SocketAgent

/**
 * A simple agent to execute a request on a given socket
 * @param socket
 * @constructor
 */
function SocketAgent(socket) {
  this.socket = socket;
}

SocketAgent.prototype.addRequest = function(req, host, port, localAddress) {
  req.onSocket(this.socket);
}

exports.ProxyingAgent = ProxyingAgent;

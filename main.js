var sys = require("sys");
var http = require("http");
var local = false;
http.createServer(
  function (client_request, client_response) {
    var r = client_request.uri.full.split('://')[0];
    var path = client_request.uri.full.replace(r+'://','', 1);
    var server = path.split('/')[0];
    var path = path.replace(server,'',1);
    if (server.indexOf(':') != -1) {
      var server = server.split(':');
      var port = parseInt(server[1]);
      var server = server[0];
    } else {
      var port = 80;
    }
    sys.puts("client requested: " + server + path);
  
    if(remote_is_couchdb()) {
      sys.puts("remote_is_couchdb()");
      if(local_has_copy(path)) {
        sys.puts("local_has_copy()");
        if(!replication_running(server, port, path)) {
          sys.puts("!replication_running()");

          // serve from localhost
          server = "127.0.0.1";
          port = 5984;
        } else {
          sys.puts("replication_running()");
        
          // serve from remote host
          // keep serverport
        }
      } else {
        if(!replication_running(server, port, path)) {
          sys.puts("replication_start()");
          replication_start(server, port, path);
        }
      }
    }


    var c = http.createClient(port, server);    
    var headers = client_request.headers;
    headers['host'] = server+':'+port;
    var proxy_request = c.request(client_request.method.toUpperCase(),path, headers);
    client_request.addListener("body", function(chunk) {
      proxy_request.sendBody(chunk);
    });
    
    proxy_request.finish(function (resp) {
      client_response.sendHeader(resp.statusCode, resp.headers);

      encoding = resp.headers['content-encoding'];
      encoding = "utf8";
      // if(resp.headers['content-encoding'] && resp.headers['content-encoding'] == 'gzip'
      //   || resp.headers['content-type'] && resp.headers['content-type'].indexOf('image') != -1) {
      //   resp.setBodyEncoding('binary');
      //   encoding = 'binary';
      // }
      
      resp.addListener("body", function(chunk) {
        client_response.sendBody(chunk, encoding);
        // sys.puts("body chunk: " + chunk);
      });
      resp.addListener("complete", function() {client_response.finish()});
    });
    }
  ).listen(8000);
sys.puts("Server running at http://127.0.0.1:8000/");

// private

function remote_is_couchdb() {
  return true;
}

function local_has_copy(path) {
  if(local) {
    return true;
  }
  var c = http.createClient(5984, "127.0.0.1");
  var headers = {};
  headers['host'] = "127.0.0.1:5984";
  var req = c.request('GET', path);
  sys.puts("get(path): " + path);
  var res;
  var done = new process.Promise();
  req.finish(function(resp) {
    sys.puts("local_has_copy(): " + resp.statusCode);
    res = resp.statusCode != 404;
    done.emitSuccess();
  })
  done.wait();

  sys.puts("res:" + res);
  local = res;
  return res;
}

function replication_start(server, port, path) {
  if(path.split("/").length > 0 
    && path.charAt(1) != "_"
    && path.substr(0,"/needles".length) != "/needles") {

      return;
  }

  sys.puts("path: " + path);
  var db = path.split("/")[1];

  var cp = http.createClient(5984, "127.0.0.1");
  var reqp = cp.request('PUT', "/" + db);
  reqp.finish(function(resp) {
    // noop
  });

  sys.puts("db: " + db);
  sys.puts("replicating db: " + db);
  var from = "http://" + server + ":" + port + "/" + db;
  var to = "http://127.0.0.1:5984/" + db;
  var c = http.createClient(5984, "127.0.0.1");
  var body = JSON.stringify({
    source: from,
    target: to
  });
  sys.puts("replication body: " + body);
  var headers = {};
  headers['host'] = "127.0.0.1:5984";
  headers['Content-Length'] = body.length;
  var req = c.request('POST', "/_replicate", headers);
  req.sendBody(body);
  req.finish(function(resp) {
    return resp.statusCode != 404;
  });
}

function replication_running(server, port, path) {
  var c = http.createClient(5984, "127.0.0.1");
  var headers = {};
  headers['host'] = "127.0.0.1:5984";
  var req = c.request('GET', path);
  var buf = "";
  req.finish(function(resp) {
    resp.addListener("body", function (chunk) {
      buf += chunk;
      var regex = new RegExp("http://" + server + ":" + port);
      return !!buf.match(regex);
    });
  });
}

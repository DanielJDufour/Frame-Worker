/*
  IE doesn't support type="module", so we essentially ignore when workerOptions.type = "module"
  and try to convert to commonjs anyway
*/
function FrameWorker(workerScript, workerOptions, extraOptions) {
  var context = typeof extraOptions === "object" && typeof extraOptions.context === "object" && extraOptions.context;
  var cjs = typeof extraOptions === "object" && typeof extraOptions.cjs === "boolean" && extraOptions.cjs;
  var debug = typeof extraOptions === "object" && extraOptions.debug === true;
  var id = typeof extraOptions === "object" && typeof extraOptions.id === "string" && extraOptions.id;
  var raw = typeof extraOptions === "object" && typeof extraOptions.raw === "boolean" && extraOptions.raw;
  var revoke = typeof extraOptions === "object" && typeof extraOptions.revoke === "boolean" && extraOptions.revoke;

  var prefix = "[frame-worker" + (id ? " " + id : "") + "] ";

  // revoke this blob's object url on termination
  var blobURL;

  function isPromise(it) {
    return typeof it === "object" && typeof it.then === "function";
  }

  // function to fetch code for JavaScript files and
  // works on older browsers that don't support fetch
  function fetchResponseText(url, callback) {
    const xhr = new XMLHttpRequest();
    xhr.overrideMimeType("text/plain");
    xhr.open("GET", url, true);
    xhr.onreadystatechange = function () {
      if (xhr.readyState == 4) {
        callback(xhr.responseText);
      }
    };
    xhr.send(null);
  }

  if (typeof workerOptions === "object" && workerOptions.type === "module") {
    throw new Error('[frame-worker] type="module" is not supported');
  }

  if (!workerScript) throw new Error("[frame-worker] can't create a FrameWorker from nothing");

  if (raw) {
    try {
      var blob = new Blob([workerScript], { type: "text/javascript" });
      workerScript = blobURL = URL.createObjectURL(blob);
    } catch (error) {
      workerScript = "data:application/javascript;base64," + btoa(workerScript);
    }
  } else if (workerScript.startsWith("data:")) {
    try {
      if (workerScript.startsWith("data:application/javascript;base64,")) {
        const decodedWorkerScript = atob(workerScript.replace("data:application/javascript;base64,", ""));
        var blob = new Blob([decodedWorkerScript], { type: "text/javascript" });
        workerScript = blobURL = URL.createObjectURL(blob);
        if (debug) console.log(prefix + "converted data url to blob url");
      } else if (workerScript.startsWith("data:application/javascript,")) {
        const content = workerScript.replace("data:application/javascript,", "");
        blob = new Blob([content], { type: "text/javascript" });
        workerScript = blobURL = URL.createObjectURL(blob);
      }

    } catch (error) {
      return "data:application/javascript;base64," + btoa(text);
    }
  }
  

  var iframe;
  var ready = false;
  var queue = [];
  var worker = {};

  function createFrameWorker() {
    iframe = document.createElement("iframe");

    if (id) iframe.id = id;

    // don't want iframe to actually display on the screen
    iframe.style.display = "none";

    document.body.appendChild(iframe);

    var _self = (iframe.contentWindow.self = iframe.contentWindow);

    // add context
    if (context) {
      for (let key in context) {
        if (context.hasOwnProperty(key)) {
          _self[key] = context[key];
        }
      }
    }

    // fake module.exports inside of iframe
    var _module = (iframe.contentWindow.module = { exports: {} });

    _self.postMessage = function (data, transfer) {
      if (worker.onmessage) {
        var evt = new MessageEvent(typeof data, { data: data });
        worker.onmessage(evt, transfer);
      }
    };

    var script = document.createElement("script");
    if (debug) console.log(prefix + "workerScript:", workerScript);

    iframe.contentWindow.onerror = (error) => {
      if (worker.onerror) {
        worker.onerror(error);
      }
    };

    script.onerror = (e) => console.error("script errror:", e);
    script.addEventListener("error", (e) => console.error("script errror:", e));

    // fetchResponseText(workerScript, function (text) {
    //   const blob = new Blob([text], { type: "text/javascript" });
    //   const url = URL.createObjectURL(blob);
    //   script.src = url;
    // });

    script.src = workerScript;

    script.onload = function () {
      ready = true;
      for (var q = 0; q < queue.length; q++) {
        var entry = queue[q];
        var queuedMessage = entry[0];
        var queuedTransfer = entry[1];
        if (_self.onmessage) {
          try {
            _self.onmessage(queuedMessage, queuedTransfer);
          } catch (error) {
            console.error(error);
            if (worker.onerror) {
              worker.onerror(error);
            }
          }
        } else if (cjs && (typeof _module.exports === "function" || typeof _module.exports.default === "function")) {
          const func = _module.exports.default || _module.exports;
          const result = func(queuedMessage.data);
          if (isPromise(result)) {
            // wait for resolution if promise
            result.then(function (ret) {
              _self.postMessage(ret);
            });
          } else {
            _self.postMessage(result);
          }
        }
      }
      if (revoke && script.src.startsWith("data:") || script.src.startsWith("blob:")) {
        if (debug) console.log(prefix + "revoking " + script.src);
        URL.revokeObjectURL(script.src);
      }
    };

    iframe.contentDocument.body.appendChild(script);

    worker.postMessage = function (data, transfer) {
      const evt = new MessageEvent(typeof data, { data });
      if (ready) {
        if (_self.onmessage) {
          try {
            _self.onmessage(evt, transfer);
          } catch (error) {
            console.error(error);
            if (worker.onerror) {
              worker.onerror(error);
            }
          }
        } else if (cjs && (typeof _module.exports === "function" || typeof _module.exports.default === "function")) {
          const func = _module.exports.default || _module.exports;
          const result = func(data);
          if (isPromise(result)) {
            // wait for resolution if promise
            result.then(function (ret) {
              _self.postMessage(ret);
            });
          } else {
            _self.postMessage(result);
          }
        }
      } else {
        queue.push([evt, transfer]);
      }
    };
    worker.terminate = function () {
      iframe.parentNode.removeChild(iframe);
      if (blobURL) {
        if (debug) console.log("[frame-worker] revoking blob object url " + blobURL);
        try {
          URL.revokeObjectURL(blobURL);  
        } catch (error) {
          console.log(error);
        }
      }
    };
  }

  createFrameWorker();

  return worker;
}

if (typeof define === "function" && define.amd) {
  define(function() { return FrameWorker; });
}

if (typeof module === "object" && module.exports) {
  module.exports = FrameWorker;
  module.exports.default = FrameWorker;
}

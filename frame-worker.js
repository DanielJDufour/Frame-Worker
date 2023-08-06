/*
  IE doesn't support type="module", so we essentially ignore when workerOptions.type = "module"
  and try to convert to commonjs anyway
*/

// function to fetch code for JavaScript files and
// works on older browsers that don't support fetch
// function fetchResponseText(url, callback) {
//   const xhr = new XMLHttpRequest();
//   xhr.overrideMimeType("text/plain");
//   xhr.open("GET", url, true);
//   xhr.onreadystatechange = function () {
//     if (xhr.readyState == 4) {
//       callback(xhr.responseText);
//     }
//   };
//   xhr.send(null);
// }

function FrameWorker(workerScript, workerOptions, extraOptions) {
  var context = typeof extraOptions === "object" && typeof extraOptions.context === "object" && extraOptions.context;
  var cjs = typeof extraOptions === "object" && typeof extraOptions.cjs === "boolean" && extraOptions.cjs;
  var debug = typeof extraOptions === "object" && extraOptions.debug === true;
  var id = typeof extraOptions === "object" && typeof extraOptions.id === "string" && extraOptions.id;
  var onblob = typeof extraOptions === "object" && typeof extraOptions.onblob === "string" && extraOptions.onblob;
  var onscripterror = typeof extraOptions === "object" && typeof extraOptions.onscripterror === "string" && extraOptions.onscripterror;
  var onterminate = typeof extraOptions === "object" && typeof extraOptions.onterminate === "string" && extraOptions.onterminate;
  var raw = typeof extraOptions === "object" && typeof extraOptions.raw === "boolean" && extraOptions.raw;
  var revoke = typeof extraOptions === "object" && typeof extraOptions.revoke === "boolean" && extraOptions.revoke;

  var prefix = "[frame-worker" + (id ? " " + id : "") + "] ";

  // revoke this blob's object url on termination
  var blobURL;

  function isPromise(it) {
    return typeof it === "object" && typeof it.then === "function";
  }

  if (typeof workerOptions === "object" && workerOptions.type === "module") {
    throw new Error('[frame-worker] type="module" is not supported');
  }

  if (!workerScript) throw new Error("[frame-worker] can't create a FrameWorker from nothing");

  if (raw) {
    try {
      var blob = new Blob([workerScript], { type: "text/javascript" });
      if (onblob) onblob(blob);
      workerScript = blobURL = URL.createObjectURL(blob);
    } catch (error) {
      workerScript = "data:application/javascript;base64," + btoa(workerScript);
    }
  } else if (workerScript.startsWith("data:")) {
    try {
      if (workerScript.startsWith("data:application/javascript;base64,")) {
        const decodedWorkerScript = atob(workerScript.replace("data:application/javascript;base64,", ""));
        var blob = new Blob([decodedWorkerScript], { type: "text/javascript" });
        if (onblob) onblob(blob);
        workerScript = blobURL = URL.createObjectURL(blob);
        if (debug) console.log(prefix + "converted data url to blob url");
      } else if (workerScript.startsWith("data:application/javascript,")) {
        const content = workerScript.replace("data:application/javascript,", "");
        var blob = new Blob([content], { type: "text/javascript" });
        if (onblob) onblob(blob);
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

  // functions to respond to events dispatched to the pseudo web worker
  var handlers = {
    message: [],
    error: [],
    messagerror: []
  };

  function createFrameWorker() {
    iframe = document.createElement("iframe");

    if (id) iframe.id = id;

    // don't want iframe to actually display on the screen
    iframe.style.display = "none";

    document.body.appendChild(iframe);

    var _self = (iframe.contentWindow.self = iframe.contentWindow);

    // hijack event listeners for iframe content window
    const self_eventListeners = {};
    _self.addEventListener = function(type, listener) {
      if (!self_eventListeners[type]) self_eventListeners[type] = [];
      self_eventListeners[type].push(listener);
    }
    _self.removeEventListener = function(type, listener) {
      if (!self_eventListeners[type]) return;
      self_eventListeners[type] = self_eventListeners[type].filter(function (it) { return it !== listener; });
      if (self_eventListeners[type].length === 0) delete self_eventListeners[type];
    }

    function getMessageHandlers () {
      return [_self.onmessage].concat(self_eventListeners.message).filter(Boolean);
    }

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

    // this is simulating postMessage INSIDE of a web worker,
    // such that this message propagates up to worker.onmessage
    // and added worker event handlers
    _self.postMessage = function (data, transfer) {
      if (worker.onmessage) {
        var evt = new MessageEvent(typeof data, { data: data });
        worker.onmessage(evt, transfer);
      }
      for (let i = 0; i < handlers.message.length; i++) {
        var evt = new MessageEvent(typeof data, { data: data });
        handlers.message[i](evt, transfer);
      }
    };

    var script = document.createElement("script");
    if (debug) console.log(prefix + "workerScript:", workerScript);

    iframe.contentWindow.onerror = function (error) {
      if (worker.onerror) {
        worker.onerror(error);
      }
    };

    script.onerror = function (e) {
      console.error("script errror:", e);
      if (onscripterror) onscripterror(e);
    };
    script.addEventListener("error", function (e) {
      console.error("script errror:", e);
      if (onscripterror) onscripterror(e);
    });

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

        // collecting all handlers including from directly setting onmessage and calling addEventListeners
        var messageHandlers = getMessageHandlers();

        if (messageHandlers.length > 0) {
          for (let h = 0; h < messageHandlers.length; h++) {
            try {
              const handler = messageHandlers[h];
              handler(queuedMessage, queuedTransfer);
            } catch (error) {
              console.error(error);
              if (worker.onerror) {
                worker.onerror(error);
              }
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

    worker.addEventListener = function (type, listener) {
      if (handlers[type].indexOf(listener) === -1) {
        handlers[type].push(listener);
      }
    }

    worker.removeEventListener = function (type, listener) {
      handlers[type] = handlers[type].filter(function (it) {
        return it !== listener;
      });
    }

    worker.postMessage = function (data, transfer) {
      const evt = new MessageEvent(typeof data, { data });
      if (ready) {
        var messageHandlers = getMessageHandlers();

        if (messageHandlers.length > 0) {
          for (let h = 0; h < messageHandlers.length; h++) {
            try {
              const handler = messageHandlers[h];
              handler(evt, transfer);
            } catch (error) {
              console.error(error);
              if (worker.onerror) {
                worker.onerror(error);
              }
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
      if (onterminate) onterminate();
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

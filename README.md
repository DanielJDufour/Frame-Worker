# Frame-Worker
> Run Web Worker Script with an IFrame

## features
- default export detection
- url shortening
- blob url revocation
- raw unencoded strings
- CommonJS code

## install
### via script tag
```html
<script src="https://unpkg.com/frame-worker"></script>
```
### via npm
```sh
npm install frame-worker
```

## basic usage
```js
import FrameWorker from "frame-worker";

// initialize from url
new FrameWorker("./square.worker.js");

// intialize from blob url
new FrameWorker("blob:http://localhost:8080/bf331630-1275-4b3d-9b65-22512egdb592");

// initialize from data url
new FrameWorker("data:application/javascript;base64,Cm1vZHVsZS5leHBvcnRzLmRlZmF1bHQgPSBmdW5jdGlvbigpIHsKICByZXR1cm4gMTIzNDsKfQ==");

// listen to messages
worker.addEventListener("message", function (event) {
  console.log("received": event.data);
});
```

## advanced usage
### context
You can pass an extra context object to the worker. FrameWorker will assign the entries in the object
to the global `window` and `self` inside the iframe.  In the example below, we pass a validate function
to the FrameWorker.
```js
new FrameWorker(workerScript, undefined, { 
  context: {
    validate: function() { ... }
  }
});
```

### cjs
You can pass in a CommonJS module and have it automatically interpreted as a Web Worker script.
If there is no self.onmessage defined in the input script, FrameWorker will automatically look for and call `module.exports` or `module.exports.default` function.
```js
const code = `
  module.exports = function() {
    return 1234;
  }
`;
new FrameWorker(code, undefined, {
  cjs: true, // code is a basic CommonJS file
  raw: true // code is not encoded in a Data URL or Blob URL
});
```

### debug
You can set debug to true for extra helpful log messages
```js
new FrameWorker(workerScript, undefined, { debug: true });
```

### id
You can specify an id to give to the created iframe.
If id is not a string, it will be ignored.
```js
new FrameWorker(workerScript, undefined, { id: "special" });
```

### raw
You can pass in raw unencoded JavaScript.
```js
new FrameWorker("console.log('hello, world')", undefined, { raw: true });
```

### revoke
If you initialize a FrameWorker with a `"blob:..."` url,
you can have the url automatically revoked after the worker is initialized.
```js
const url = "blob:http://localhost:8080/bf331630-1275-4b3d-9b65-22512egdb592";
new FrameWorker(url, undefined, { revoke: true });
```

console.log("[square.worker.js] inside square.worker.js, self is " + self.name);
self.onmessage = (msg, transfer) => {
  console.log("[square.worker.js] recv'd message", msg);
  let result = Math.pow(msg.data, 2);
  console.log("[square.worker.js] posting", result);
  console.log("[square.worker.js] self is:", self);
  if (self._multiplier) result *= self._multiplier;
  self.postMessage(result, transfer);
};

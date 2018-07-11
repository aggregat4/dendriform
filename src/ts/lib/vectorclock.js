// from https://github.com/mixu/vectorclock

// Params are containers,
// which have a clock key { clock: {} }

const GT = 1;
const LT = -1;
const CONCURRENT = 0;

// increments the counter for nodeId
export function increment(o, nodeId) {
  if(o.clock) {
    o.clock[nodeId] = (typeof o.clock[nodeId] == 'undefined' ? 1 : o.clock[nodeId] + 1);
  } else {
    o[nodeId] = (typeof o[nodeId] == 'undefined' ? 1 : o[nodeId] + 1);
  }
  return o;
};

function allKeys(a, b){
  var last = null;
  return Object.keys(a)
    .concat(Object.keys(b))
    .sort()
    .filter(function(item) {
      // to make a set of sorted keys unique, just check that consecutive keys are different
      var isDuplicate = (item == last);
      last = item;
      return !isDuplicate;
    });
}

// like a regular sort function, returns:
// if a < b: -1
// if a == b: 0
// if a > b: 1
// E.g. if used to sort an array of keys, will order them in ascending order (1, 2, 3 ..)
export function compare(a, b) {
  var isGreater = false,
      isLess = false;

  // allow this function to be called with objects that contain clocks, or the clocks themselves
  if(a.clock) a = a.clock;
  if(b.clock) b = b.clock;

  allKeys(a, b).forEach(function(key) {
    var diff = (a[key] || 0) - (b[key] || 0);
    if(diff > 0) isGreater = true;
    if(diff < 0) isLess = true;
  });

  if(isGreater && isLess) return 0;
  if(isLess) return -1;
  if(isGreater) return 1;
  return 0; // neither is set, so equal
};

export function ascSort(a, b) {
  return compare(a, b)
}

// sort in descending order (N, ... 3, 2, 1)
export function descSort(a, b) {
  return 0 - ascSort(a, b);
};

// equal, or not less and not greater than
export function isConcurrent(a, b) {
  return !!(compare(a, b) == 0);
};

// identical
export function isIdentical(a, b) {
  // allow this function to be called with objects that contain clocks, or the clocks themselves
  if(a.clock) a = a.clock;
  if(b.clock) b = b.clock;

  return allKeys(a, b).every(function(key) {
    if(typeof a[key] == 'undefined' || typeof b[key] == 'undefined') return false;
    var diff = a[key] - b[key];
    if(diff != 0) return false;
    return true;
  });
};


// given two vector clocks, returns a new vector clock with all values greater than
// those of the merged clocks
export function merge(a, b) {
  var last = null, result = {}, wantContainer = false;
  // allow this function to be called with objects that contain clocks, or the clocks themselves
  if(a.clock && b.clock) wantContainer = true;
  if(a.clock) a = a.clock;
  if(b.clock) b = b.clock;

  allKeys(a, b).forEach(function(key) {
    result[key] = Math.max(a[key] || 0, b[key] || 0);
  });
  if(wantContainer) {
    return { clock: result };
  }
  return result;
};

export function isEmpty(str) {
  return (!str || str.length === 0);
}

export function getHashValue(key) {
  const matches = location.hash.match(new RegExp(`${key}=([^&]*)?`));
  return matches && matches.length >= 2 ? matches[1] : null;
}

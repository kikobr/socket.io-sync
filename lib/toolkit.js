// Generate simple random password
exports.randomPassword = function(length) {
  chars = "abcdefghijklmnopqrstuvwxyz1234567890";
  pass = "";
  for(x=0;x<length;x++) {
    i = Math.floor(Math.random() * chars.length);
    pass += chars.charAt(i);
  }
  return pass;
}
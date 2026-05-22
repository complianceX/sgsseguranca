module.exports = {
  testDir: __dirname,
  testMatch: /apr-smoke\.spec\.js$/,
  timeout: 60000,
  use: {
    baseURL: "http://localhost:3000",
    trace: "off",
    screenshot: "off",
    video: "off",
  },
};

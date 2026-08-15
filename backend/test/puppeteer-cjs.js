// Puppeteer 25 is ESM-only at runtime. Unit tests mock launch and executablePath,
// so keep Jest's CJS transform independent from the browser package entrypoint.
module.exports = {
  launch: async () => {
    throw new Error('puppeteer.launch must be mocked by the test');
  },
  executablePath: async () => '',
};

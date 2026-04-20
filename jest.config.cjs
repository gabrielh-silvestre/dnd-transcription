module.exports = {
  rootDir: ".",
  testEnvironment: "node",
  roots: ["<rootDir>/dist/tests"],
  testMatch: ["**/*.test.js"],
  setupFilesAfterEnv: ["<rootDir>/dist/tests/setup/jest.setup.js"],
  testTimeout: 30_000,
  transform: {},
};

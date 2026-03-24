export default function globalTeardown() {
  delete process.env.E2E_INFRA_AVAILABLE;
}

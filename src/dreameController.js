import {
  loginDreame,
  listDevices,
  deviceInfo,
  readRobotState,
  startCleaning,
  pauseCleaning,
  stopCleaning,
  goHome,
} from "./dreameClient.js";

/**
 * Camada fina de controle (ainda “simples”, mas já com cara de lib).
 * Depois é só plugar no Matterbridge.
 */
export class DreameController {
  constructor({ pickDeviceIndex = 0 } = {}) {
    this.pickDeviceIndex = pickDeviceIndex;

    this.auth = null;
    this.device = null; // { did, bindDomain, model, ... }
    this.deviceId = null; // cloud id (device/info.data.id)
  }

  async init({ username, password } = {}) {
    this.auth = await loginDreame({ username, password });

    const devices = await listDevices({
      accessToken: this.auth.accessToken,
      tenantId: this.auth.tenantId,
    });

    const records = devices?.page?.records ?? devices?.records ?? [];
    if (!records.length) throw new Error("Nenhum device encontrado");

    this.device = records[this.pickDeviceIndex] ?? records[0];

    const info = await deviceInfo({
      accessToken: this.auth.accessToken,
      tenantId: this.auth.tenantId,
      did: this.device.did,
    });

    this.deviceId = info?.data?.id;
    if (!this.deviceId)
      throw new Error("Não consegui obter deviceId (cloud) via device/info");

    return {
      tenantId: this.auth.tenantId,
      baseUrl: this.auth.baseUrl,
      did: String(this.device.did),
      model: this.device.model,
      bindDomain: this.device.bindDomain,
      deviceId: String(this.deviceId),
    };
  }

  ctx() {
    if (!this.auth || !this.device || !this.deviceId) {
      throw new Error("Controller não inicializado. Chame init() primeiro.");
    }

    return {
      accessToken: this.auth.accessToken,
      tenantId: this.auth.tenantId,
      deviceDid: this.device.did,
      deviceId: this.deviceId,
      bindDomain: this.device.bindDomain,
    };
  }

  async status() {
    const { accessToken, tenantId, deviceDid } = this.ctx();
    return readRobotState({ accessToken, tenantId, deviceDid });
  }

  async start() {
    return startCleaning(this.ctx());
  }

  async pause() {
    return pauseCleaning(this.ctx());
  }

  async resume() {
    // no Dreame cloud, resume == start quando está pausado
    return startCleaning(this.ctx());
  }

  async stop() {
    return stopCleaning(this.ctx());
  }

  async home() {
    return goHome(this.ctx());
  }
}

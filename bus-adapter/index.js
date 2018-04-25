'use strict';

class DeviceAdapter {
    constructor(busAdapter) {
        this.busAdapter = busAdapter;
    }

    setupDevice(device) {
        this.device = device;
    }

    /* eslint class-methods-use-this: "warn" */
    onRequest(message) {
        throw new Error(`Adapter doesn't implement request ${message.data.name}`);
    }

    static test() {
        return false;
    }
}

const DEVICE_TYPE = 'wand';
const DEVICE_PREFIX = 'harry-potter-wand';

class WandAdapter extends DeviceAdapter {
    static getDeviceSetupInfo(device) {
        const deviceData = device.toJSON();
        return {
            deviceId: deviceData.id,
            deviceType: DEVICE_PREFIX,
            availableChannels: [{
                channel: 'ble',
                address: deviceData.address.toString(),
                status: deviceData.bluetooth.state,
            }],
            activeChannel: 'ble',
        };
    }

    static updateDevice(adapter, device) {
        const deviceData = device.toJSON();
        adapter.bus.emit(
            'device-update',
            adapter.constructor.buildEvent(
                deviceData.id,
                WandAdapter.getDeviceSetupInfo(device),
            ),
        );
    }

    static onDiscover(device, adapter) {
        const deviceData = device.toJSON();
        device.on('connect', () => WandAdapter.updateDevice(adapter, device));
        device.on('connecting', () => WandAdapter.updateDevice(adapter, device));
        device.on('reconnect', () => WandAdapter.updateDevice(adapter, device));
        device.on('reconnecting', () => WandAdapter.updateDevice(adapter, device));
        device.on('disconnect', () => WandAdapter.updateDevice(adapter, device));
        device.on('position', (position) => {
            adapter.bus.emit(
                `${DEVICE_PREFIX}-position`,
                adapter.constructor.buildEvent(deviceData.id, position),
            );
        });
        device.on('user-button', (value) => {
            adapter.bus.emit(
                `${DEVICE_PREFIX}-button`,
                adapter.constructor.buildEvent(deviceData.id, value),
            );
        });
        device.on('battery-status', (value) => {
            adapter.bus.emit(
                `${DEVICE_PREFIX}-battery-status`,
                adapter.constructor.buildEvent(deviceData.id, value),
            );
        });
        device.on('update-progress', (value) => {
            adapter.bus.emit(
                `${DEVICE_PREFIX}-update-progress`,
                adapter.constructor.buildEvent(deviceData.id, value),
            );
        });
    }

    static onRequest(message, device) {
        switch (message.data.name) {
        case 'organisation': {
            return device.getOrganisation();
        }
        case 'software-version': {
            return device.getSoftwareVersion();
        }
        case 'hardware-build': {
            return device.getHardwareBuild();
        }
        case 'battery-status': {
            return device.getBatteryStatus();
        }
        case 'subscribe-battery-status': {
            return device.subscribeBatteryStatus().then(() => null);
        }
        case 'unsubscribe-battery-status': {
            return device.unsubscribeBatteryStatus().then(() => null);
        }
        case 'vibrate': {
            return device.vibrate(message.data.detail).then(() => null);
        }
        case 'led-status': {
            return device.getLedStatus();
        }
        case 'led': {
            return device.setLed(
                message.data.detail.pattern,
                message.data.detail.value,
            ).then(() => null);
        }
        case 'reset-pairing': {
            return device.resetPairing().then(() => null);
        }
        case 'subscribe-button': {
            return device.subscribeButton().then(() => null);
        }
        case 'unsubscribe-button': {
            return device.unsubscribeButton().then(() => null);
        }
        case 'subscribe-sleep': {
            return device.subscribeSleep().then(() => null);
        }
        case 'unsubscribe-sleep': {
            return device.unsubscribeSleep().then(() => null);
        }
        case 'keep-alive': {
            return device.keepAlive().then(() => null);
        }
        case 'subscribe-position': {
            return device.subscribeEuler().then(() => null);
        }
        case 'unsubscribe-position': {
            return device.unsubscribeEuler().then(() => null);
        }
        case 'calibrate-gyroscope': {
            return device.calibrateGyroscope().then(() => null);
        }
        case 'calibrate-magnetometer': {
            return device.calibrateMagnetometer().then(() => null);
        }
        case 'update': {
            return device.update(message.data.detail).then(() => null);
        }
        case 'disconnect': {
            return device.disconnect().then(() => null);
        }
        case 'reconnect': {
            return device.reconnect().then(() => null);
        }
        case 'reset-quaternions': {
            return device.resetQuaternions().then(() => null);
        }
        default: {
            return null;
        }
        }
    }

    static test(device) {
        return device.type === DEVICE_TYPE;
    }
}

const DEVICE_ADAPTERS = [WandAdapter];

class BusAdapter {
    constructor(opts = {}) {
        this.Devices = opts.Devices;
        this.bus = opts.bus;

        this.setupDiscovery();
        this.setupRequests();
    }
    static buildResponse(message, value) {
        return {
            eventId: message.eventId,
            error: null,
            data: {
                deviceId: message.data.deviceId,
                value,
            },
        };
    }
    static buildEvent(deviceId, value) {
        return {
            eventId: 0,
            error: null,
            data: { deviceId, value },
        };
    }
    reply(message, value = null) {
        this.bus.emit('response', BusAdapter.buildResponse(message, value));
    }
    setupDiscovery() {
        this.Devices.on('new-device', (device) => {
            let adapter;
            for (let i = 0; i < DEVICE_ADAPTERS.length; i += 1) {
                adapter = DEVICE_ADAPTERS[i];
                if (adapter.test(device)) {
                    break;
                }
            }
            if (!adapter) {
                throw new Error(`No adapter found for device '${device.type}'`);
            }
            adapter.onDiscover(device, this);
            this.bus.emit('device-available', {
                eventId: 0,
                error: null,
                data: adapter.getDeviceSetupInfo(device),
            });
        });
    }
    static getAdapter(device) {
        let adapter;
        for (let i = 0; i < DEVICE_ADAPTERS.length; i += 1) {
            adapter = DEVICE_ADAPTERS[i];
            if (adapter.test(device)) {
                return adapter;
            }
        }
        return null;
    }
    setupRequests() {
        this.bus.on('request-available-devices', (message) => {
            const devices = this.Devices.getAll();
            const devicesData = devices.map((device) => {
                const adapter = BusAdapter.getAdapter(device);
                if (!adapter) {
                    return null;
                }
                return adapter.getDeviceSetupInfo(device);
            }).filter(deviceData => deviceData);
            this.bus.emit('available-devices', {
                eventId: message.eventId,
                error: null,
                data: devicesData,
            });
        });
        this.bus.on('start-bluetooth-scan', (message) => {
            this.Devices.startBluetoothScan()
                .catch(() => {})
                .then(() => {
                    this.bus.emit('bluetooth-scan-end', {
                        eventId: message.eventId,
                        error: null,
                        data: null,
                    });
                });
        });
        this.bus.on('request', (message) => {
            const device = this.Devices.getById(message.data.deviceId);
            if (!device) {
                throw new Error(`Could not find device with id '${message.data.deviceId}'`);
            }
            let responsePromise;
            for (let i = 0; i < DEVICE_ADAPTERS.length; i += 1) {
                responsePromise = DEVICE_ADAPTERS[i].onRequest(message, device);
                if (responsePromise instanceof Promise) {
                    break;
                }
            }
            responsePromise.then(value => this.reply(message, value));
        });
    }
}

module.exports = BusAdapter;

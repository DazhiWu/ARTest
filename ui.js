import { Utils } from './utils.js';

class UI {
    constructor(arCore, pipelineLoader) {
        this.arCore = arCore;
        this.pipelineLoader = pipelineLoader;
        
        this.activePanel = null;
        this.calibrationOffset = { x: 0, y: 0, z: 0 };
        this.isMeasuring = false;
        this.measurementPoints = [];
        
        this.onCalibrationChange = null;
        this.onLayerChange = null;
        this.onDepthChange = null;
        this.onMeasurementComplete = null;
        
        this.manualLocation = {
            enabled: false,
            lat: 0,
            lng: 0,
            rotation: 0
        };
        
        this.tempManualLocation = {
            lat: 0,
            lng: 0,
            rotation: 0
        };
    }

    init() {
        this.setupPanelTabs();
        this.setupLayerControls();
        this.setupDepthControls();
        this.setupToolButtons();
        this.setupInfoPanel();
        this.setupCalibrationPanel();
        this.setupMeasurementPanel();
        this.setupManualLocationPanel();
        this.setupCloseButtons();
        this.setupAdditionalControls();
    }

    setupPanelTabs() {
        const tabs = document.querySelectorAll('.panel-tab');
        
        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                const panelName = tab.dataset.tab;
                this.togglePanel(panelName);
            });
        });
    }

    togglePanel(panelName) {
        const panels = ['layers', 'depth', 'tools'];
        const panel = document.getElementById(`${panelName}-panel`);
        const tab = document.querySelector(`.panel-tab[data-tab="${panelName}"]`);
        
        document.getElementById('info-panel').classList.add('hidden');
        document.getElementById('calibration-panel').classList.add('hidden');
        document.getElementById('measurement-panel').classList.add('hidden');
        document.getElementById('manual-location-panel').classList.add('hidden');
        
        if (this.activePanel === panelName) {
            panel.classList.remove('active');
            tab.classList.remove('active');
            this.activePanel = null;
        } else {
            panels.forEach(p => {
                const pPanel = document.getElementById(`${p}-panel`);
                const pTab = document.querySelector(`.panel-tab[data-tab="${p}"]`);
                if (pPanel) pPanel.classList.remove('active');
                if (pTab) pTab.classList.remove('active');
            });
            
            panel.classList.add('active');
            tab.classList.add('active');
            this.activePanel = panelName;
        }
    }

    setupLayerControls() {
        const layerCheckboxes = {
            'layer-water': 'water',
            'layer-drainage': 'drainage',
            'layer-power': 'power',
            'layer-gas': 'gas'
        };
        
        Object.entries(layerCheckboxes).forEach(([id, layer]) => {
            const checkbox = document.getElementById(id);
            if (checkbox) {
                checkbox.addEventListener('change', (e) => {
                    if (this.onLayerChange) {
                        this.onLayerChange(layer, e.target.checked);
                    }
                });
            }
        });
    }

    setupDepthControls() {
        const minSlider = document.getElementById('min-depth-slider');
        const maxSlider = document.getElementById('max-depth-slider');
        const minValue = document.getElementById('min-depth-value');
        const maxValue = document.getElementById('max-depth-value');
        
        if (minSlider) {
            minSlider.addEventListener('input', (e) => {
                minValue.textContent = e.target.value;
                if (this.onDepthChange) {
                    this.onDepthChange(parseFloat(e.target.value), parseFloat(maxSlider.value));
                }
            });
        }
        
        if (maxSlider) {
            maxSlider.addEventListener('input', (e) => {
                maxValue.textContent = e.target.value;
                if (this.onDepthChange) {
                    this.onDepthChange(parseFloat(minSlider.value), parseFloat(e.target.value));
                }
            });
        }
    }

    setupToolButtons() {
        const calibrationBtn = document.getElementById('calibration-btn');
        const manualLocationBtn = document.getElementById('manual-location-btn');
        const measureBtn = document.getElementById('measure-btn');
        const fullscreenBtn = document.getElementById('fullscreen-btn');
        
        if (calibrationBtn) {
            calibrationBtn.addEventListener('click', () => {
                this.hideAllPanels();
                document.getElementById('calibration-panel').classList.remove('hidden');
            });
        }
        
        if (manualLocationBtn) {
            manualLocationBtn.addEventListener('click', () => {
                this.openManualLocationPanel();
            });
        }
        
        if (measureBtn) {
            measureBtn.addEventListener('click', () => {
                this.hideAllPanels();
                document.getElementById('measurement-panel').classList.remove('hidden');
                this.startMeasurement();
            });
        }
        
        if (fullscreenBtn) {
            fullscreenBtn.addEventListener('click', () => {
                this.toggleFullscreen();
            });
        }
    }

    setupInfoPanel() {
    }

    showInfoPanel(info) {
        document.getElementById('info-type').textContent = info.type;
        document.getElementById('info-diameter').textContent = info.diameter + ' mm';
        document.getElementById('info-material').textContent = info.material;
        document.getElementById('info-depth').textContent = info.depth + ' 米';
        document.getElementById('info-year').textContent = info.buildYear;
        document.getElementById('info-owner').textContent = info.owner;
        
        this.hideAllPanels();
        document.getElementById('info-panel').classList.remove('hidden');
    }

    setupCalibrationPanel() {
        const calButtons = document.querySelectorAll('.cal-btn');
        const confirmBtn = document.getElementById('confirm-calibration');
        
        calButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                const axis = btn.dataset.axis;
                const dir = parseInt(btn.dataset.dir);
                const step = 0.5;
                
                this.calibrationOffset[axis] += dir * step;
                
                if (this.onCalibrationChange) {
                    this.onCalibrationChange(
                        this.calibrationOffset.x,
                        this.calibrationOffset.y,
                        this.calibrationOffset.z
                    );
                }
            });
        });
        
        if (confirmBtn) {
            confirmBtn.addEventListener('click', () => {
                document.getElementById('calibration-panel').classList.add('hidden');
                Utils.showToast('校准已保存');
            });
        }
    }

    setupMeasurementPanel() {
        const clearBtn = document.getElementById('clear-measurement');
        
        if (clearBtn) {
            clearBtn.addEventListener('click', () => {
                this.clearMeasurement();
            });
        }
    }

    startMeasurement() {
        this.isMeasuring = true;
        this.measurementPoints = [];
        Utils.showToast('点击屏幕选择第一个点');
    }

    addMeasurementPoint(lat, lng) {
        if (!this.isMeasuring) return;
        
        this.measurementPoints.push({ lat, lng });
        
        if (this.measurementPoints.length === 1) {
            Utils.showToast('点击屏幕选择第二个点');
        } else if (this.measurementPoints.length === 2) {
            this.calculateDistance();
            this.isMeasuring = false;
        }
    }

    calculateDistance() {
        if (this.measurementPoints.length < 2) return;
        
        const p1 = this.measurementPoints[0];
        const p2 = this.measurementPoints[1];
        
        const distance = Utils.calculateDistance(p1.lat, p1.lng, p2.lat, p2.lng);
        const distanceDisplay = document.getElementById('measurement-value');
        
        if (distanceDisplay) {
            distanceDisplay.textContent = distance.toFixed(2);
        }
        
        if (this.onMeasurementComplete) {
            this.onMeasurementComplete(distance);
        }
    }

    clearMeasurement() {
        this.isMeasuring = false;
        this.measurementPoints = [];
        const distanceDisplay = document.getElementById('measurement-value');
        if (distanceDisplay) {
            distanceDisplay.textContent = '--';
        }
    }

    setupCloseButtons() {
        const closeButtons = document.querySelectorAll('.close-panel');
        
        closeButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                const panel = btn.closest('.control-panel, #info-panel, #calibration-panel, #measurement-panel, #manual-location-panel');
                if (panel) {
                    panel.classList.add('hidden');
                    if (panel.classList.contains('control-panel')) {
                        const panelName = panel.id.replace('-panel', '');
                        const tab = document.querySelector(`.panel-tab[data-tab="${panelName}"]`);
                        if (tab) tab.classList.remove('active');
                        this.activePanel = null;
                    }
                }
            });
        });
    }

    hideAllPanels() {
        document.querySelectorAll('.control-panel, #info-panel, #calibration-panel, #measurement-panel, #manual-location-panel').forEach(panel => {
            panel.classList.add('hidden');
            panel.classList.remove('active');
        });
        document.querySelectorAll('.panel-tab').forEach(tab => {
            tab.classList.remove('active');
        });
        this.activePanel = null;
    }

    toggleFullscreen() {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch(err => {
                Utils.showToast('无法进入全屏模式');
            });
        } else {
            document.exitFullscreen();
        }
    }

    resetView() {
        this.calibrationOffset = { x: 0, y: 0, z: 0 };
        if (this.onCalibrationChange) {
            this.onCalibrationChange(0, 0, 0);
        }
        Utils.showToast('视角已重置');
    }

    showLoadingScreen() {
        document.getElementById('loading-screen').classList.remove('hidden');
    }

    hideLoadingScreen() {
        document.getElementById('loading-screen').classList.add('hidden');
    }

    showPermissionScreen() {
        document.getElementById('permission-screen').classList.remove('hidden');
    }

    hidePermissionScreen() {
        document.getElementById('permission-screen').classList.add('hidden');
    }

    setupPermissionButton(callback) {
        const btn = document.getElementById('request-permission-btn');
        if (btn) {
            btn.addEventListener('click', callback);
        }
    }

    setupAdditionalControls() {
        const resetViewBtn = document.getElementById('reset-view-btn');
        if (resetViewBtn) {
            resetViewBtn.addEventListener('click', () => {
                this.arCore.setCalibrationOffset(0, 0, 0);
                this.arCore.setVirtualHeight(0);
                this.arCore.setScale(1);
                document.getElementById('height-slider').value = 0;
                document.getElementById('height-value').textContent = '0';
                document.getElementById('scale-slider').value = 1;
                document.getElementById('scale-value').textContent = '1.0';
                Utils.showToast('视角已重置');
                this.hideAllPanels();
            });
        }

        const heightSlider = document.getElementById('height-slider');
        const heightValue = document.getElementById('height-value');
        if (heightSlider && heightValue) {
            heightSlider.addEventListener('input', (e) => {
                const value = parseFloat(e.target.value);
                heightValue.textContent = value;
                this.arCore.setVirtualHeight(value);
            });
        }

        const scaleSlider = document.getElementById('scale-slider');
        const scaleValue = document.getElementById('scale-value');
        if (scaleSlider && scaleValue) {
            scaleSlider.addEventListener('input', (e) => {
                const value = parseFloat(e.target.value);
                scaleValue.textContent = value.toFixed(1);
                this.arCore.setScale(value);
            });
        }

        const presetButtons = document.querySelectorAll('.preset-btn');
        presetButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                const preset = btn.dataset.preset;
                this.applyViewPreset(preset);
            });
        });

        const loadRealDataBtn = document.getElementById('load-real-data-btn');
        if (loadRealDataBtn) {
            loadRealDataBtn.addEventListener('click', () => {
                this.loadRealPipelineData();
            });
        }
    }

    applyViewPreset(preset) {
        const camera = this.arCore.camera;
        switch (preset) {
            case 'ground':
                camera.position.set(0, 3, 5);
                camera.lookAt(0, 0, 0);
                Utils.showToast('已切换到地面视角');
                break;
            case 'top':
                camera.position.set(0, 30, 0.01);
                camera.lookAt(0, 0, 0);
                Utils.showToast('已切换到俯视视角');
                break;
            case 'side':
                camera.position.set(20, 10, 0);
                camera.lookAt(0, 0, 0);
                Utils.showToast('已切换到侧视视角');
                break;
        }
        this.hideAllPanels();
    }

    async loadRealPipelineData() {
        Utils.showToast('正在加载真实数据...');
        try {
            await this.pipelineLoader.loadData('public/highway.geojsonl.json');
            
            this.pipelineLoader.clearPipelines();
            this.pipelineLoader.generatePipelines(
                this.arCore.originLocation.lat,
                this.arCore.originLocation.lng
            );
            
            Utils.showToast(`已加载 ${this.pipelineLoader.pipelines.length} 条真实管线数据`);
        } catch (error) {
            console.error('加载真实数据失败:', error);
            Utils.showToast('加载真实数据失败');
        }
        this.hideAllPanels();
    }

    updateLocationDisplay(lat, lng, rotation = 0, altitude = 0) {
        const latDisplay = document.getElementById('latitude-display');
        const lngDisplay = document.getElementById('longitude-display');
        const additionalDisplay = document.getElementById('additional-info');
        
        if (latDisplay && lngDisplay) {
            latDisplay.textContent = Utils.decimalToDMS(lat, true);
            lngDisplay.textContent = Utils.decimalToDMS(lng, false);
        }
        
        if (additionalDisplay) {
            additionalDisplay.textContent = `朝向角: ${rotation.toFixed(2)}° 高程: ${altitude.toFixed(2)}m`;
        }
    }

    setupManualLocationPanel() {
        const rotationSlider = document.getElementById('rotation-slider');
        const rotationValue = document.getElementById('rotation-value');
        const applyBtn = document.getElementById('apply-location-btn');
        const cancelBtn = document.getElementById('cancel-location-btn');
        const resetBtn = document.getElementById('reset-location-btn');
        
        if (rotationSlider && rotationValue) {
            rotationSlider.addEventListener('input', (e) => {
                const value = parseInt(e.target.value);
                rotationValue.textContent = value;
                this.tempManualLocation.rotation = value;
            });
        }
        
        if (applyBtn) {
            applyBtn.addEventListener('click', () => {
                this.applyManualLocation();
            });
        }
        
        if (cancelBtn) {
            cancelBtn.addEventListener('click', () => {
                this.closeManualLocationPanel();
            });
        }
        
        if (resetBtn) {
            resetBtn.addEventListener('click', () => {
                this.resetToAutoLocation();
            });
        }
    }

    openManualLocationPanel() {
        this.hideAllPanels();
        
        const latInput = document.getElementById('manual-latitude');
        const lngInput = document.getElementById('manual-longitude');
        const rotationSlider = document.getElementById('rotation-slider');
        const rotationValue = document.getElementById('rotation-value');
        
        if (this.manualLocation.enabled) {
            this.tempManualLocation.lat = this.manualLocation.lat;
            this.tempManualLocation.lng = this.manualLocation.lng;
            this.tempManualLocation.rotation = this.manualLocation.rotation;
        } else {
            this.tempManualLocation.lat = this.arCore.userLocation.lat;
            this.tempManualLocation.lng = this.arCore.userLocation.lng;
            this.tempManualLocation.rotation = 0;
        }
        
        if (latInput) latInput.value = this.tempManualLocation.lat;
        if (lngInput) lngInput.value = this.tempManualLocation.lng;
        if (rotationSlider) rotationSlider.value = this.tempManualLocation.rotation;
        if (rotationValue) rotationValue.textContent = this.tempManualLocation.rotation;
        
        document.getElementById('manual-location-panel').classList.remove('hidden');
    }

    closeManualLocationPanel() {
        document.getElementById('manual-location-panel').classList.add('hidden');
    }

    applyManualLocation() {
        const latInput = document.getElementById('manual-latitude');
        const lngInput = document.getElementById('manual-longitude');
        
        if (latInput && latInput.value) {
            this.tempManualLocation.lat = parseFloat(latInput.value);
        }
        if (lngInput && lngInput.value) {
            this.tempManualLocation.lng = parseFloat(lngInput.value);
        }
        
        this.manualLocation.enabled = true;
        this.manualLocation.lat = this.tempManualLocation.lat;
        this.manualLocation.lng = this.tempManualLocation.lng;
        this.manualLocation.rotation = this.tempManualLocation.rotation;
        
        this.arCore.setManualLocation(this.manualLocation.lat, this.manualLocation.lng, this.manualLocation.rotation);
        
        this.saveManualLocationPreferences();
        
        Utils.showToast('手动定位已应用');
        this.closeManualLocationPanel();
    }

    resetToAutoLocation() {
        this.manualLocation.enabled = false;
        this.arCore.disableManualLocation();
        this.clearManualLocationPreferences();
        Utils.showToast('已恢复自动定位');
        this.closeManualLocationPanel();
    }

    saveManualLocationPreferences() {
        try {
            localStorage.setItem('manualLocation', JSON.stringify(this.manualLocation));
        } catch (e) {
            console.warn('无法保存手动定位偏好:', e);
        }
    }

    loadManualLocationPreferences() {
        try {
            const saved = localStorage.getItem('manualLocation');
            if (saved) {
                this.manualLocation = JSON.parse(saved);
                if (this.manualLocation.enabled) {
                    this.arCore.setManualLocation(
                        this.manualLocation.lat,
                        this.manualLocation.lng,
                        this.manualLocation.rotation
                    );
                }
            }
        } catch (e) {
            console.warn('无法加载手动定位偏好:', e);
        }
    }

    clearManualLocationPreferences() {
        try {
            localStorage.removeItem('manualLocation');
        } catch (e) {
            console.warn('无法清除手动定位偏好:', e);
        }
    }
}

export { UI };

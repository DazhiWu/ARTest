import { Utils } from './utils.js';
import { ARCore } from './ar-core.js';
import { PipelineLoader } from './pipeline-loader.js';
import { UI } from './ui.js';

class App {
    constructor() {
        this.arCore = null;
        this.pipelineLoader = null;
        this.ui = null;
        this.isInitialized = false;
        this.animationId = null;
    }

    async init() {
        try {
            Utils.updateLoadingStatus('正在初始化应用...');
            
            if (!this.checkWebGLSupport()) {
                throw new Error('浏览器不支持WebGL');
            }
            
            this.arCore = new ARCore();
            await this.arCore.init();
            
            this.pipelineLoader = new PipelineLoader(this.arCore);
            this.ui = new UI(this.arCore, this.pipelineLoader);
            this.ui.init();
            
            this.setupEventHandlers();
            
            this.ui.hideLoadingScreen();
            this.ui.showPermissionScreen();
            this.ui.setupPermissionButton(() => this.requestPermissions());
            
            this.isInitialized = true;
            
        } catch (error) {
            console.error('初始化失败:', error);
            Utils.showToast('应用初始化失败，请刷新重试');
            Utils.updateLoadingStatus('初始化失败');
        }
    }

    checkWebGLSupport() {
        const canvas = document.createElement('canvas');
        const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
        if (!gl) {
            Utils.showToast('您的浏览器不支持WebGL，无法运行AR功能');
            return false;
        }
        return true;
    }

    async requestPermissions() {
        this.ui.hidePermissionScreen();
        this.ui.showLoadingScreen();
        
        try {
            const cameraOk = await this.arCore.startCamera();
            if (!cameraOk) {
                Utils.showToast('摄像头启动失败，将使用模拟模式');
            }
            
            const gpsOk = await this.arCore.startGPS();
            if (!gpsOk) {
                Utils.showToast('GPS定位失败，将使用模拟位置');
                this.useMockLocation();
            }
            
            await this.arCore.startCompass();
            
            await this.loadPipelineData();
            
            this.ui.hideLoadingScreen();
            Utils.showToast('系统已就绪，开始查看地下管网！');
            
            this.ui.loadManualLocationPreferences();
            
        } catch (error) {
            console.error('权限申请失败:', error);
            Utils.updateLoadingStatus('部分功能受限');
            Utils.showToast('部分权限未获取，将使用模拟数据');
            
            if (!this.arCore.isGPSReady) {
                this.useMockLocation();
            }
            
            try {
                await this.loadPipelineData();
            } catch (e) {
                console.error('加载数据失败:', e);
            }
            
            this.ui.hideLoadingScreen();
            this.ui.loadManualLocationPreferences();
        } finally {
            this.startRendering();
        }
    }

    useMockLocation() {
        this.arCore.userLocation = {
            lat: 28.0171,
            lng: 120.6534,
            alt: 10
        };
        
        this.arCore.originLocation = {
            lat: 28.0171,
            lng: 120.6534
        };
        
        this.arCore.isGPSReady = true;
        this.arCore.updateGPSStatus(true, '模拟');
        this.arCore.updateCameraPositionFromGPS();
    }

    async loadPipelineData() {
        Utils.updateLoadingStatus('正在加载管网数据...');
        
        try {
            await this.pipelineLoader.loadData('public/highway.geojsonl.json');
            
            this.pipelineLoader.generatePipelines(
                this.arCore.originLocation.lat,
                this.arCore.originLocation.lng
            );
            
            Utils.showToast(`已加载 ${this.pipelineLoader.pipelines.length} 条管线数据`);
        } catch (error) {
            console.error('加载数据失败，使用测试数据:', error);
            this.pipelineLoader.createTestPipelines();
            Utils.showToast('加载失败，已加载测试数据');
        }
    }

    setupEventHandlers() {
        this.arCore.onPipelineClick = (info) => {
            this.ui.showInfoPanel(info);
            this.pipelineLoader.highlightPipeline(info.id);
        };
        
        this.ui.onLayerChange = (layer, visible) => {
            this.pipelineLoader.setLayerVisibility(layer, visible);
        };
        
        this.ui.onDepthChange = (min, max) => {
            this.pipelineLoader.setDepthRange(min, max);
        };
        
        this.ui.onCalibrationChange = (x, y, z) => {
            this.arCore.setCalibrationOffset(x, y, z);
        };
    }

    startRendering() {
        const animate = (timestamp) => {
            this.animationId = requestAnimationFrame(animate);
            this.arCore.render(timestamp);
            this.ui.updateLocationDisplay(
                this.arCore.userLocation.lat,
                this.arCore.userLocation.lng,
                this.arCore.getCurrentRotation(),
                this.arCore.getCurrentAltitude()
            );
        };
        
        animate(0);
    }

    destroy() {
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
        }
        
        if (this.arCore) {
            this.arCore.destroy();
        }
    }
}

const app = new App();

window.addEventListener('DOMContentLoaded', () => {
    app.init();
});

window.addEventListener('beforeunload', () => {
    app.destroy();
});

export { app };

import { Utils } from './utils.js';

class ARCore {
    constructor() {
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.videoElement = null;
        this.canvasElement = null;
        
        this.userLocation = { lat: 0, lng: 0, alt: 0 };
        this.originLocation = { lat: 0, lng: 0 };
        this.calibrationOffset = { x: 0, y: 0, z: 0 };
        this.virtualHeight = 0;
        this.scale = 1;
        
        this.manualLocation = {
            enabled: false,
            lat: 0,
            lng: 0,
            rotation: 0
        };
        
        this.isGPSReady = false;
        this.isCompassReady = false;
        
        this.pipelineGroup = null;
        this.raycaster = null;
        this.mouse = null;
        
        this.lastFrameTime = 0;
        this.frameCount = 0;
        this.lastFPSUpdate = 0;
        
        this.onPipelineClick = null;
        
        this.currentOrientation = { x: 0, y: 0, z: 0 };
        this.targetOrientation = { x: 0, y: 0, z: 0 };
        this.orientationSmoothing = 0.15;
        
        this.currentPosition = new THREE.Vector3(0, 1.6, 0);
        this.targetPosition = new THREE.Vector3(0, 1.6, 0);
        this.positionSmoothing = 0.1;
        
        this.needsOrientationUpdate = false;
        this.needsPositionUpdate = false;
    }

    async init() {
        Utils.updateLoadingStatus('初始化Three.js场景...');
        
        this.setupScene();
        this.setupCamera();
        this.setupRenderer();
        this.setupLights();
        this.setupDebugGrid();
        
        this.pipelineGroup = new THREE.Group();
        this.scene.add(this.pipelineGroup);
        
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();
        
        this.setupEventListeners();
        
        Utils.updateLoadingStatus('场景初始化完成');
        
        return true;
    }

    setupScene() {
        this.scene = new THREE.Scene();
        this.scene.background = null;
    }

    setupCamera() {
        const aspect = window.innerWidth / window.innerHeight;
        this.camera = new THREE.PerspectiveCamera(60, aspect, 0.1, 1000);
        this.camera.position.copy(this.currentPosition);
        this.camera.rotation.order = 'YXZ';
    }

    setupRenderer() {
        this.canvasElement = document.getElementById('ar-canvas');
        this.videoElement = document.getElementById('camera-feed');
        
        this.renderer = new THREE.WebGLRenderer({
            canvas: this.canvasElement,
            antialias: true,
            alpha: true,
            depth: true,
            logarithmicDepthBuffer: true
        });
        
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        
        this.renderer.setClearColor(0x000000, 0);
        this.renderer.autoClear = true;
        this.renderer.autoClearDepth = true;
        this.renderer.autoClearStencil = true;
    }

    setupLights() {
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        this.scene.add(ambientLight);
        
        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
        directionalLight.position.set(10, 20, 10);
        this.scene.add(directionalLight);
    }

    setupDebugGrid() {
        const gridHelper = new THREE.GridHelper(100, 50, 0x444444, 0x222222);
        gridHelper.position.y = -2;
        gridHelper.material.opacity = 0.3;
        gridHelper.material.transparent = true;
        this.scene.add(gridHelper);
        
        const groundGeometry = new THREE.PlaneGeometry(100, 100);
        const groundMaterial = new THREE.MeshBasicMaterial({
            color: 0x006600,
            transparent: true,
            opacity: 0.1,
            side: THREE.DoubleSide
        });
        const groundPlane = new THREE.Mesh(groundGeometry, groundMaterial);
        groundPlane.rotation.x = -Math.PI / 2;
        groundPlane.position.y = -2;
        this.scene.add(groundPlane);
    }

    setupEventListeners() {
        window.addEventListener('resize', () => this.onResize());
        this.canvasElement.addEventListener('click', (e) => this.onCanvasClick(e));
        this.canvasElement.addEventListener('touchstart', (e) => this.onTouchStart(e), { passive: false });
    }

    onResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }

    onCanvasClick(event) {
        const rect = this.canvasElement.getBoundingClientRect();
        this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
        
        this.checkIntersection();
    }

    onTouchStart(event) {
        if (event.touches.length === 1) {
            event.preventDefault();
            const touch = event.touches[0];
            const rect = this.canvasElement.getBoundingClientRect();
            this.mouse.x = ((touch.clientX - rect.left) / rect.width) * 2 - 1;
            this.mouse.y = -((touch.clientY - rect.top) / rect.height) * 2 + 1;
            
            setTimeout(() => this.checkIntersection(), 100);
        }
    }

    checkIntersection() {
        this.raycaster.setFromCamera(this.mouse, this.camera);
        
        const meshes = [];
        this.pipelineGroup.traverse((child) => {
            if (child.isMesh) {
                meshes.push(child);
            }
        });
        
        const intersects = this.raycaster.intersectObjects(meshes);
        
        if (intersects.length > 0) {
            const clickedObject = intersects[0].object;
            if (clickedObject.userData.pipelineInfo && this.onPipelineClick) {
                this.onPipelineClick(clickedObject.userData.pipelineInfo);
            }
        }
    }

    async startCamera() {
        Utils.updateLoadingStatus('正在启动摄像头...');
        
        try {
            const constraints = {
                video: {
                    facingMode: 'environment',
                    width: { ideal: 1280 },
                    height: { ideal: 720 }
                }
            };
            
            const stream = await navigator.mediaDevices.getUserMedia(constraints);
            this.videoElement.srcObject = stream;
            
            await new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                    console.warn('视频加载超时，继续启动');
                    resolve();
                }, 3000);
                
                this.videoElement.onloadedmetadata = () => {
                    clearTimeout(timeout);
                    this.videoElement.play().catch(() => {});
                    resolve();
                };
                
                this.videoElement.onerror = () => {
                    clearTimeout(timeout);
                    resolve();
                };
            });
            
            Utils.updateLoadingStatus('摄像头已启动');
            return true;
        } catch (error) {
            console.error('摄像头启动失败:', error);
            Utils.showToast('摄像头启动失败，请检查权限');
            return false;
        }
    }

    async startGPS() {
        Utils.updateLoadingStatus('正在获取GPS位置...');
        
        return new Promise((resolve) => {
            if (!navigator.geolocation) {
                Utils.showToast('您的设备不支持GPS定位');
                this.updateGPSStatus(false);
                resolve(false);
                return;
            }
            
            const options = {
                enableHighAccuracy: true,
                timeout: 10000,
                maximumAge: 0
            };
            
            const onSuccess = (position) => {
                this.userLocation = {
                    lat: position.coords.latitude,
                    lng: position.coords.longitude,
                    alt: position.coords.altitude || 0
                };
                
                this.originLocation = {
                    lat: this.userLocation.lat,
                    lng: this.userLocation.lng
                };
                
                this.isGPSReady = true;
                this.updateGPSStatus(true, position.coords.accuracy);
                Utils.updateLoadingStatus('GPS定位成功');
                
                this.setupGPSWatch();
                resolve(true);
            };
            
            const onError = (error) => {
                console.error('GPS定位失败:', error);
                let message = 'GPS定位失败';
                switch (error.code) {
                    case error.PERMISSION_DENIED:
                        message = '请允许定位权限';
                        break;
                    case error.POSITION_UNAVAILABLE:
                        message = '无法获取位置信息';
                        break;
                    case error.TIMEOUT:
                        message = '定位超时，请重试';
                        break;
                }
                Utils.showToast(message);
                this.updateGPSStatus(false);
                resolve(false);
            };
            
            navigator.geolocation.getCurrentPosition(onSuccess, onError, options);
        });
    }

    setupGPSWatch() {
        const options = {
            enableHighAccuracy: true,
            timeout: 5000,
            maximumAge: 0
        };
        
        this.gpsWatchId = navigator.geolocation.watchPosition(
            (position) => {
                if (!this.manualLocation.enabled) {
                    this.userLocation = {
                        lat: position.coords.latitude,
                        lng: position.coords.longitude,
                        alt: position.coords.altitude || 0
                    };
                    this.updateGPSStatus(true, position.coords.accuracy);
                    this.updateCameraPositionFromGPS();
                }
            },
            (error) => {
                console.warn('GPS更新失败:', error);
            },
            options
        );
    }
    
    updateCameraPositionFromGPS() {
        if (!this.isGPSReady || !this.originLocation) {
            return;
        }
        
        const localCoords = Utils.wgs84ToLocal(
            this.originLocation.lat,
            this.originLocation.lng,
            this.userLocation.lat,
            this.userLocation.lng,
            0
        );
        
        const cameraHeight = 1.6;
        const y = cameraHeight + this.virtualHeight + this.calibrationOffset.y;
        
        this.targetPosition.set(
            localCoords.x + this.calibrationOffset.x,
            y,
            localCoords.z + this.calibrationOffset.z
        );
        this.needsPositionUpdate = true;
    }

    updateGPSStatus(ready, accuracy = null) {
        const badge = document.getElementById('gps-status');
        if (ready) {
            badge.classList.add('active');
            badge.classList.remove('error');
            badge.textContent = accuracy ? `GPS: ±${Math.round(accuracy)}m` : 'GPS: 就绪';
        } else {
            badge.classList.add('error');
            badge.classList.remove('active');
            badge.textContent = 'GPS: 错误';
        }
    }

    async startCompass() {
        Utils.updateLoadingStatus('正在初始化罗盘...');
        
        return new Promise((resolve) => {
            if (typeof DeviceOrientationEvent !== 'undefined' && 
                typeof DeviceOrientationEvent.requestPermission === 'function') {
                
                DeviceOrientationEvent.requestPermission()
                    .then((response) => {
                        if (response === 'granted') {
                            this.setupOrientationListener();
                            resolve(true);
                        } else {
                            Utils.showToast('请允许传感器权限');
                            this.updateCompassStatus(false);
                            resolve(false);
                        }
                    })
                    .catch(() => {
                        this.updateCompassStatus(false);
                        resolve(false);
                    });
            } else {
                this.setupOrientationListener();
                resolve(true);
            }
        });
    }

    setupOrientationListener() {
        const handleOrientation = Utils.throttle((event) => {
            if (event.alpha !== null && !this.manualLocation.enabled) {
                const alpha = event.alpha;
                const beta = event.beta;
                const gamma = event.gamma;
                
                this.updateCameraOrientation(alpha, beta, gamma);
                this.isCompassReady = true;
                this.updateCompassStatus(true);
            }
        }, 30);
        
        window.addEventListener('deviceorientation', handleOrientation);
    }

    updateCameraOrientation(alpha, beta, gamma) {
        const alphaRad = Utils.toRadians(alpha);
        const betaRad = Utils.toRadians(beta);
        const gammaRad = Utils.toRadians(gamma);
        
        const x = betaRad;
        const y = -alphaRad;
        const z = -gammaRad;
        
        this.targetOrientation = { x, y, z };
        this.needsOrientationUpdate = true;
    }

    updateCompassStatus(ready) {
        const badge = document.getElementById('compass-status');
        if (ready) {
            badge.classList.add('active');
            badge.classList.remove('error');
            badge.textContent = '罗盘: 就绪';
        } else {
            badge.classList.add('error');
            badge.classList.remove('active');
            badge.textContent = '罗盘: 错误';
        }
    }

    addPipeline(mesh) {
        this.pipelineGroup.add(mesh);
    }

    removePipeline(mesh) {
        this.pipelineGroup.remove(mesh);
    }

    clearPipelines() {
        while (this.pipelineGroup.children.length > 0) {
            const child = this.pipelineGroup.children[0];
            this.pipelineGroup.remove(child);
            if (child.geometry) child.geometry.dispose();
            if (child.material) {
                if (Array.isArray(child.material)) {
                    child.material.forEach(m => m.dispose());
                } else {
                    child.material.dispose();
                }
            }
        }
    }

    setCalibrationOffset(x, y, z) {
        this.calibrationOffset = { x, y, z };
        this.updatePipelineTransform();
    }

    setVirtualHeight(height) {
        this.virtualHeight = height;
        this.updatePipelineTransform();
    }

    setScale(scale) {
        this.scale = scale;
        this.updatePipelineTransform();
    }

    updatePipelineTransform() {
        const x = this.calibrationOffset.x;
        const y = this.calibrationOffset.y + this.virtualHeight;
        const z = this.calibrationOffset.z;
        
        this.pipelineGroup.position.set(x, y, z);
        this.pipelineGroup.scale.set(this.scale, this.scale, this.scale);
    }

    setMinDepth(value) {
        this.pipelineGroup.traverse((child) => {
            if (child.isMesh && child.userData.pipelineInfo) {
                const depth = child.userData.pipelineInfo.depth;
                child.visible = child.visible && depth >= value;
            }
        });
    }

    setMaxDepth(value) {
        this.pipelineGroup.traverse((child) => {
            if (child.isMesh && child.userData.pipelineInfo) {
                const depth = child.userData.pipelineInfo.depth;
                child.visible = child.visible && depth <= value;
            }
        });
    }

    setManualLocation(lat, lng, rotation) {
        this.manualLocation.enabled = true;
        this.manualLocation.lat = lat;
        this.manualLocation.lng = lng;
        this.manualLocation.rotation = rotation;
        
        this.userLocation.lat = lat;
        this.userLocation.lng = lng;
        
        if (!this.originLocation.lat && !this.originLocation.lng) {
            this.originLocation.lat = lat;
            this.originLocation.lng = lng;
        }
        
        this.updateCameraPositionFromGPS();
        this.updateCameraOrientationFromManualRotation(rotation);
    }

    disableManualLocation() {
        this.manualLocation.enabled = false;
    }

    updateCameraOrientationFromManualRotation(rotation) {
        const rad = Utils.toRadians(rotation);
        this.targetOrientation.y = -rad;
        this.needsOrientationUpdate = true;
    }

    getCurrentRotation() {
        if (this.manualLocation.enabled) {
            return this.manualLocation.rotation;
        }
        let rotation = Utils.toDegrees(-this.currentOrientation.y);
        if (rotation < 0) rotation += 360;
        return rotation;
    }

    getCurrentAltitude() {
        return this.userLocation.alt || 0;
    }

    render(timestamp) {
        const deltaTime = timestamp - this.lastFrameTime;
        this.lastFrameTime = timestamp;
        
        this.frameCount++;
        if (timestamp - this.lastFPSUpdate >= 1000) {
            const fps = Math.round(this.frameCount / ((timestamp - this.lastFPSUpdate) / 1000));
            document.getElementById('fps-display').textContent = `FPS: ${fps}`;
            this.frameCount = 0;
            this.lastFPSUpdate = timestamp;
        }
        
        this.updateSmoothing(deltaTime);
        
        this.renderer.render(this.scene, this.camera);
    }
    
    updateSmoothing(deltaTime) {
        if (this.needsOrientationUpdate) {
            this.currentOrientation.x = Utils.lerp(
                this.currentOrientation.x,
                this.targetOrientation.x,
                this.orientationSmoothing
            );
            this.currentOrientation.y = Utils.lerp(
                this.currentOrientation.y,
                this.targetOrientation.y,
                this.orientationSmoothing
            );
            this.currentOrientation.z = Utils.lerp(
                this.currentOrientation.z,
                this.targetOrientation.z,
                this.orientationSmoothing
            );
            
            this.camera.rotation.set(
                this.currentOrientation.x,
                this.currentOrientation.y,
                this.currentOrientation.z
            );
        }
        
        if (this.needsPositionUpdate) {
            this.currentPosition.lerp(this.targetPosition, this.positionSmoothing);
            this.camera.position.copy(this.currentPosition);
        }
    }

    destroy() {
        if (this.gpsWatchId) {
            navigator.geolocation.clearWatch(this.gpsWatchId);
        }
        
        if (this.renderer) {
            this.renderer.dispose();
        }
        
        const stream = this.videoElement.srcObject;
        if (stream) {
            stream.getTracks().forEach(track => track.stop());
        }
    }
}

export { ARCore };

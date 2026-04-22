import { Utils } from './utils.js';
import { GroundDetectionSystem } from './ground-detection-system.js';
import { PipelineWorkflow } from './pipeline-workflow.js';

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
        
        // WebXR 锚定系统
        this.xrSession = null;
        this.xrReferenceSpace = null;
        this.xrViewerSpace = null;
        this.isXRActive = false;
        this.useFallbackMode = false; // 备用模式标志
        
        // 锚定管理
        this.anchors = [];
        this.anchorGroup = null;
        this.mainAnchor = null;
        this.isAnchored = false;
        
        // 平面检测
        this.detectedPlanes = [];
        this.planeVisualizers = [];
        this.hitTestSource = null;
        
        // 备用锚定系统（无需WebXR）
    this.fallbackAnchor = null;
    this.fallbackGround = null;
    this.isFallbackMode = false;
    this.groundCalibrated = false;
    this.groundZeroPoint = new THREE.Vector3(0, 0, 0);
    this.realWorldScale = 1.0;
    this.calibrationMarker = null;
        
        // 锚定状态回调
        this.onAnchorStatus = null;
        
        // 地面检测系统
        this.groundDetectionSystem = null;
        
        // 流程控制器
        this.workflowController = null;
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
        
        // 初始化地面检测系统
        this.groundDetectionSystem = new GroundDetectionSystem(this);
        await this.groundDetectionSystem.init();
        
        // 流程控制器将在UI中初始化
        this.setupEventListeners();
        
        Utils.updateLoadingStatus('场景初始化完成');
        
        return true;
    }

    setupScene() {
        this.scene = new THREE.Scene();
        this.scene.background = null;
        this.scene.autoUpdate = true;
        
        // 初始化锚定组
        this.anchorGroup = new THREE.Group();
        this.scene.add(this.anchorGroup);
    }

    setupCamera() {
        const aspect = window.innerWidth / window.innerHeight;
        const fov = Utils.calculateCameraFOV();
        this.camera = new THREE.PerspectiveCamera(fov, aspect, 0.1, 2000);
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
            logarithmicDepthBuffer: true,
            premultipliedAlpha: true,
            preserveDrawingBuffer: false
        });
        
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        
        this.renderer.setClearColor(0x000000, 0);
        this.renderer.autoClear = true;
        this.renderer.autoClearDepth = true;
        this.renderer.autoClearStencil = true;
        
        this.renderer.outputEncoding = THREE.sRGBEncoding;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.0;
    }

    setupLights() {
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
        this.scene.add(ambientLight);
        
        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.6);
        directionalLight.position.set(0, 50, 0);
        directionalLight.castShadow = false;
        this.scene.add(directionalLight);
        
        const hemisphereLight = new THREE.HemisphereLight(0xffffff, 0x444444, 0.4);
        this.scene.add(hemisphereLight);
    }

    setupDebugGrid() {
    }

    setupEventListeners() {
        window.addEventListener('resize', () => this.onResize());
        this.canvasElement.addEventListener('click', (e) => this.onCanvasClick(e));
        this.canvasElement.addEventListener('touchstart', (e) => this.onTouchStart(e), { passive: false });
    }

    onResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.fov = Utils.calculateCameraFOV();
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }

    onCanvasClick(event) {
        const rect = this.canvasElement.getBoundingClientRect();
        this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
        
        // 如果地面检测系统正在运行，优先处理地面点击
        if (this.groundDetectionSystem && this.groundDetectionSystem.isActive) {
            const hitPoint = this.groundDetectionSystem.handleClick(event.clientX, event.clientY);
            if (hitPoint) {
                // 已经在地面检测系统中处理了
                return;
            }
        }
        
        // 否则处理管线点击
        this.checkIntersection();
    }
    
    onTouchStart(event) {
        if (event.touches.length === 1) {
            event.preventDefault();
            const touch = event.touches[0];
            const rect = this.canvasElement.getBoundingClientRect();
            this.mouse.x = ((touch.clientX - rect.left) / rect.width) * 2 - 1;
            this.mouse.y = -((touch.clientY - rect.top) / rect.height) * 2 + 1;
            
            // 如果地面检测系统正在运行，优先处理地面触摸
            if (this.groundDetectionSystem && this.groundDetectionSystem.isActive) {
                const hitPoint = this.groundDetectionSystem.handleClick(touch.clientX, touch.clientY);
                if (hitPoint) {
                    return;
                }
            }
            
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
    
    setRealWorldScale(scale) {
        this.realWorldScale = scale;
        this.updatePipelineTransform();
    }

    updatePipelineTransform() {
        if (this.groundCalibrated && this.groundZeroPoint) {
            // 地面已校准，管线绑定到真实地面
            this.pipelineGroup.position.set(
                this.groundZeroPoint.x + this.calibrationOffset.x,
                this.groundZeroPoint.y + this.calibrationOffset.y + this.virtualHeight,
                this.groundZeroPoint.z + this.calibrationOffset.z
            );
            this.pipelineGroup.scale.set(this.realWorldScale * this.scale, this.realWorldScale * this.scale, this.realWorldScale * this.scale);
        } else {
            // 未校准，使用原始位置
            const x = this.calibrationOffset.x;
            const y = this.calibrationOffset.y + this.virtualHeight;
            const z = this.calibrationOffset.z;
            
            this.pipelineGroup.position.set(x, y, z);
            this.pipelineGroup.scale.set(this.scale, this.scale, this.scale);
        }
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
        
        // 更新地面检测系统
        if (this.groundDetectionSystem) {
            this.groundDetectionSystem.update(timestamp);
        }
        
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

    async startWebXR() {
        Utils.updateLoadingStatus('正在初始化WebXR AR...');
        
        try {
            if (!navigator.xr) {
                throw new Error('您的设备不支持WebXR');
            }
            
            const isSupported = await navigator.xr.isSessionSupported('immersive-ar');
            if (!isSupported) {
                throw new Error('设备不支持AR沉浸式会话');
            }
            
            this.xrSession = await navigator.xr.requestSession('immersive-ar', {
                requiredFeatures: ['local', 'hit-test'],
                optionalFeatures: ['plane-detection', 'anchors']
            });
            
            this.xrSession.addEventListener('end', () => this.onXREnd());
            
            this.xrReferenceSpace = await this.xrSession.requestReferenceSpace('local');
            this.xrViewerSpace = await this.xrSession.requestReferenceSpace('viewer');
            
            if (this.xrSession.requestHitTestSource) {
                this.hitTestSource = await this.xrSession.requestHitTestSource({
                    space: this.xrViewerSpace
                });
            }
            
            this.renderer.xr.setSession(this.xrSession);
            this.renderer.xr.setReferenceSpaceType('local');
            this.isXRActive = true;
            
            if (this.xrSession.addEventListener) {
                this.xrSession.addEventListener('planesdetected', (event) => this.onPlanesDetected(event));
            }
            
            Utils.updateLoadingStatus('WebXR AR 已启动');
            this.updateAnchorStatus('ready');
            return true;
            
        } catch (error) {
            console.error('WebXR 启动失败:', error);
            Utils.showToast(error.message || 'WebXR 启动失败');
            this.updateAnchorStatus('error');
            return false;
        }
    }
    
    async stopWebXR() {
        if (this.xrSession) {
            await this.xrSession.end();
        }
    }
    
    /**
     * 启动完整的地面检测与匹配系统
     */
    async startGroundDetection(mode = 'auto') {
        if (!this.groundDetectionSystem) {
            Utils.showToast('地面检测系统未初始化');
            return false;
        }
        
        let detectionMode = mode;
        if (mode === 'auto') {
            // 自动选择最佳模式
            detectionMode = await this.groundDetectionSystem.detectBestAvailableMode();
        }
        
        const success = await this.groundDetectionSystem.startDetection(detectionMode);
        if (success) {
            this.updateGroundDetectionStatus('active', detectionMode);
        }
        return success;
    }
    
    /**
     * 停止地面检测系统
     */
    stopGroundDetection() {
        if (this.groundDetectionSystem) {
            this.groundDetectionSystem.stopDetection();
            this.updateGroundDetectionStatus('inactive', null);
        }
    }
    
    /**
     * 更新地面检测状态显示
     */
    updateGroundDetectionStatus(status, mode) {
        const statusElement = document.getElementById('ground-detection-status');
        if (!statusElement) return;
        
        switch (status) {
            case 'active':
                statusElement.classList.remove('error', 'warning');
                statusElement.classList.add('active');
                const modeNames = {
                    'webxr': 'WebXR 平面检测',
                    'sensor': '传感器检测',
                    'manual': '手动校准'
                };
                statusElement.textContent = `地面: ${modeNames[mode] || '检测中'}`;
                break;
            case 'inactive':
                statusElement.classList.remove('active', 'warning');
                statusElement.classList.add('error');
                statusElement.textContent = '地面: 未检测';
                break;
            case 'error':
                statusElement.classList.remove('active', 'warning');
                statusElement.classList.add('error');
                statusElement.textContent = '地面: 检测失败';
                break;
        }
    }
    
    onXREnd() {
        this.isXRActive = false;
        this.xrSession = null;
        this.xrReferenceSpace = null;
        this.xrViewerSpace = null;
        this.hitTestSource = null;
        this.clearPlaneVisualizers();
        this.updateAnchorStatus('disconnected');
    }
    
    onPlanesDetected(event) {
        if (event && event.planes) {
            this.detectedPlanes = Array.from(event.planes);
            this.updatePlaneVisualizers();
        }
    }
    
    updatePlaneVisualizers() {
        this.clearPlaneVisualizers();
        
        this.detectedPlanes.forEach(plane => {
            const visualizer = this.createPlaneVisualizer(plane);
            this.planeVisualizers.push(visualizer);
            this.scene.add(visualizer);
        });
    }
    
    createPlaneVisualizer(plane) {
        const group = new THREE.Group();
        
        const polygon = plane.polygon || [];
        if (polygon.length >= 3) {
            const shape = new THREE.Shape();
            shape.moveTo(polygon[0].x, polygon[0].z);
            for (let i = 1; i < polygon.length; i++) {
                shape.lineTo(polygon[i].x, polygon[i].z);
            }
            shape.closePath();
            
            const geometry = new THREE.ShapeGeometry(shape);
            const material = new THREE.MeshBasicMaterial({
                color: plane.orientation === 'horizontal' ? 0x00ff00 : 0x0088ff,
                transparent: true,
                opacity: 0.3,
                side: THREE.DoubleSide
            });
            
            const mesh = new THREE.Mesh(geometry, material);
            mesh.rotation.x = -Math.PI / 2;
            group.add(mesh);
            
            const edges = new THREE.EdgesGeometry(geometry);
            const lineMaterial = new THREE.LineBasicMaterial({
                color: 0xffffff,
                transparent: true,
                opacity: 0.8
            });
            const line = new THREE.LineSegments(edges, lineMaterial);
            line.rotation.x = -Math.PI / 2;
            group.add(line);
        }
        
        group.matrix.fromArray(plane.transform.matrix);
        group.matrix.decompose(group.position, group.quaternion, group.scale);
        
        return group;
    }
    
    clearPlaneVisualizers() {
        this.planeVisualizers.forEach(v => this.scene.remove(v));
        this.planeVisualizers = [];
    }
    
    async performHitTest(x, y) {
        if (!this.xrSession || !this.hitTestSource) {
            return null;
        }
        
        try {
            const frame = this.renderer.xr.getFrame();
            if (!frame) return null;
            
            const hitTestResults = frame.getHitTestResults(this.hitTestSource);
            if (hitTestResults.length > 0) {
                const hit = hitTestResults[0];
                const pose = hit.getPose(this.xrReferenceSpace);
                if (pose) {
                    return {
                        pose: pose,
                        matrix: pose.transform.matrix
                    };
                }
            }
        } catch (error) {
            console.error('Hit test 失败:', error);
        }
        
        return null;
    }
    
    async createAnchorAtHitTest(hitTestResult) {
        if (!this.xrSession || !hitTestResult) {
            return null;
        }
        
        try {
            let anchor;
            
            if (this.xrSession.createAnchor) {
                const space = hitTestResult.pose.transform.space;
                const matrix = hitTestResult.matrix;
                anchor = await this.xrSession.createAnchor(matrix, space);
            }
            
            const anchorObject = this.createAnchorObject();
            
            const position = new THREE.Vector3();
            const quaternion = new THREE.Quaternion();
            const scale = new THREE.Vector3();
            
            const matrix = new THREE.Matrix4();
            matrix.fromArray(hitTestResult.matrix);
            matrix.decompose(position, quaternion, scale);
            
            anchorObject.position.copy(position);
            anchorObject.quaternion.copy(quaternion);
            
            this.anchorGroup.add(anchorObject);
            
            if (this.mainAnchor) {
                this.anchorGroup.remove(this.mainAnchor);
            }
            
            this.mainAnchor = anchorObject;
            this.anchors.push({
                anchor: anchor,
                object: anchorObject
            });
            
            this.attachPipelinesToAnchor();
            this.isAnchored = true;
            this.updateAnchorStatus('anchored');
            
            Utils.showToast('管线已锚定到真实地面！');
            
            return anchorObject;
            
        } catch (error) {
            console.error('创建锚点失败:', error);
            return null;
        }
    }
    
    createAnchorObject() {
        const group = new THREE.Group();
        
        const ringGeometry = new THREE.RingGeometry(0.1, 0.15, 32);
        const ringMaterial = new THREE.MeshBasicMaterial({
            color: 0x00ff00,
            transparent: true,
            opacity: 0.8,
            side: THREE.DoubleSide
        });
        const ring = new THREE.Mesh(ringGeometry, ringMaterial);
        ring.rotation.x = -Math.PI / 2;
        group.add(ring);
        
        const crossGeometry1 = new THREE.BoxGeometry(0.3, 0.02, 0.02);
        const crossGeometry2 = new THREE.BoxGeometry(0.02, 0.02, 0.3);
        const crossMaterial = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
        const cross1 = new THREE.Mesh(crossGeometry1, crossMaterial);
        const cross2 = new THREE.Mesh(crossGeometry2, crossMaterial);
        cross1.position.y = 0.01;
        cross2.position.y = 0.01;
        group.add(cross1);
        group.add(cross2);
        
        const poleGeometry = new THREE.CylinderGeometry(0.02, 0.02, 0.5, 16);
        const poleMaterial = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
        const pole = new THREE.Mesh(poleGeometry, poleMaterial);
        pole.position.y = 0.25;
        group.add(pole);
        
        return group;
    }
    
    attachPipelinesToAnchor() {
        if (this.mainAnchor && this.pipelineGroup) {
            const worldPos = new THREE.Vector3();
            const worldQuat = new THREE.Quaternion();
            const worldScale = new THREE.Vector3();
            
            this.pipelineGroup.getWorldPosition(worldPos);
            this.pipelineGroup.getWorldQuaternion(worldQuat);
            this.pipelineGroup.getWorldScale(worldScale);
            
            this.scene.remove(this.pipelineGroup);
            this.mainAnchor.add(this.pipelineGroup);
            
            this.pipelineGroup.position.copy(worldPos);
            this.pipelineGroup.quaternion.copy(worldQuat);
            this.pipelineGroup.scale.copy(worldScale);
            
            this.pipelineGroup.position.set(0, 0, 0);
        }
    }
    
    async placeAnchorByClick(screenX, screenY) {
        if (!this.isXRActive) {
            Utils.showToast('请先启动WebXR AR');
            return;
        }
        
        const hitResult = await this.performHitTest(screenX, screenY);
        if (hitResult) {
            await this.createAnchorAtHitTest(hitResult);
        } else {
            Utils.showToast('未检测到平面，请将摄像头对准地面');
        }
    }
    
    clearAnchors() {
        this.anchors.forEach(a => {
            if (a.object) {
                this.anchorGroup.remove(a.object);
            }
            if (a.anchor && a.anchor.delete) {
                a.anchor.delete();
            }
        });
        
        this.anchors = [];
        this.mainAnchor = null;
        this.isAnchored = false;
        
        if (this.pipelineGroup && this.anchorGroup) {
            this.anchorGroup.remove(this.pipelineGroup);
            this.scene.add(this.pipelineGroup);
        }
        
        this.updateAnchorStatus('ready');
    }
    
    setPipelineToManualOrigin() {
        if (this.pipelineGroup) {
            this.pipelineGroup.position.set(
                this.calibrationOffset.x,
                this.calibrationOffset.y + this.virtualHeight,
                this.calibrationOffset.z
            );
            this.pipelineGroup.scale.set(this.scale, this.scale, this.scale);
        }
    }
    
    // ==================== 真实地面校准系统（无需WebXR）====================
    
    async startFallbackMode() {
        Utils.updateLoadingStatus('启动地面校准模式...');
        
        try {
            this.isFallbackMode = true;
            this.isXRActive = false;
            
            // 创建用于碰撞检测的地面平面（隐藏）
            this.createInvisibleGroundPlane();
            
            // 创建校准标记
            this.createCalibrationMarker();
            
            // 启用点击校准
            this.canvasElement.addEventListener('click', this.fallbackClickHandler, false);
            this.canvasElement.addEventListener('touchstart', this.fallbackTouchHandler, { passive: false });
            
            Utils.updateLoadingStatus('地面校准模式已启动');
            this.updateAnchorStatus('fallback_ready');
            Utils.showToast('请点击真实地面放置锚点进行校准');
            
            return true;
        } catch (error) {
            console.error('地面校准模式启动失败:', error);
            Utils.showToast('地面校准模式启动失败: ' + error.message);
            return false;
        }
    }
    
    createInvisibleGroundPlane() {
        // 创建一个大型的、完全透明的地面平面用于碰撞检测
        const groundGeometry = new THREE.PlaneGeometry(500, 500);
        const groundMaterial = new THREE.MeshBasicMaterial({
            color: 0x000000,
            transparent: true,
            opacity: 0,
            side: THREE.DoubleSide,
            depthTest: false,
            depthWrite: false
        });
        this.fallbackGround = new THREE.Mesh(groundGeometry, groundMaterial);
        this.fallbackGround.rotation.x = -Math.PI / 2;
        this.fallbackGround.position.y = 0;
        this.fallbackGround.name = 'invisible-ground-plane';
        this.scene.add(this.fallbackGround);
    }
    
    createCalibrationMarker() {
        // 创建校准标记（初始隐藏）
        const markerGroup = new THREE.Group();
        
        // 中心点球体
        const sphereGeo = new THREE.SphereGeometry(0.1, 16, 16);
        const sphereMat = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
        const sphere = new THREE.Mesh(sphereGeo, sphereMat);
        markerGroup.add(sphere);
        
        // 环形标记
        const ringGeo = new THREE.RingGeometry(0.3, 0.4, 32);
        const ringMat = new THREE.MeshBasicMaterial({ 
            color: 0x00ff00, 
            transparent: true, 
            opacity: 0.7,
            side: THREE.DoubleSide
        });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.rotation.x = -Math.PI / 2;
        markerGroup.add(ring);
        
        // 十字线
        const crossGeo1 = new THREE.BoxGeometry(1.0, 0.02, 0.02);
        const crossGeo2 = new THREE.BoxGeometry(0.02, 0.02, 1.0);
        const crossMat = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
        const cross1 = new THREE.Mesh(crossGeo1, crossMat);
        const cross2 = new THREE.Mesh(crossGeo2, crossMat);
        markerGroup.add(cross1);
        markerGroup.add(cross2);
        
        markerGroup.visible = false;
        this.calibrationMarker = markerGroup;
        this.scene.add(this.calibrationMarker);
    }
    
    fallbackClickHandler = (event) => {
        if (!this.isFallbackMode) return;
        event.preventDefault();
        this.calibrateGroundByClick(event.clientX, event.clientY);
    }
    
    fallbackTouchHandler = (event) => {
        if (!this.isFallbackMode) return;
        event.preventDefault();
        const touch = event.touches[0];
        this.calibrateGroundByClick(touch.clientX, touch.clientY);
    }
    
    async calibrateGroundByClick(screenX, screenY) {
        try {
            // 计算鼠标位置（归一化设备坐标）
            const rect = this.canvasElement.getBoundingClientRect();
            const mouse = new THREE.Vector2(
                ((screenX - rect.left) / rect.width) * 2 - 1,
                -((screenY - rect.top) / rect.height) * 2 + 1
            );
            
            // 创建射线投射
            this.raycaster.setFromCamera(mouse, this.camera);
            
            // 与地面平面相交
            const intersects = this.raycaster.intersectObject(this.fallbackGround);
            
            if (intersects.length > 0) {
                const hitPoint = intersects[0].point;
                
                // 执行地面校准
                this.performGroundCalibration(hitPoint);
            } else {
                // 如果没有检测到平面交点，使用相机前方的默认位置
                const defaultPosition = new THREE.Vector3(0, 0, -5);
                defaultPosition.applyMatrix4(this.camera.matrixWorld);
                defaultPosition.y = 0;
                
                this.performGroundCalibration(defaultPosition);
                Utils.showToast('已使用默认位置校准');
            }
        } catch (error) {
            console.error('地面校准失败:', error);
            Utils.showToast('校准时出错: ' + error.message);
        }
    }
    
    performGroundCalibration(calibrationPoint) {
        // 保存地面零点
        this.groundZeroPoint.copy(calibrationPoint);
        this.groundCalibrated = true;
        
        // 显示校准标记
        if (this.calibrationMarker) {
            this.calibrationMarker.position.copy(calibrationPoint);
            this.calibrationMarker.visible = true;
        }
        
        // 创建并设置锚点
        this.createFallbackAnchorAtPosition(calibrationPoint);
        
        // 绑定管线到真实地面
        this.bindPipelinesToGround(calibrationPoint);
        
        Utils.showToast('地面校准完成！管线已贴合真实地面');
    }
    
    bindPipelinesToGround(groundPoint) {
        if (!this.pipelineGroup) return;
        
        // 将管线组绑定到校准的地面位置
        this.pipelineGroup.position.set(
            groundPoint.x + this.calibrationOffset.x,
            groundPoint.y + this.calibrationOffset.y + this.virtualHeight,
            groundPoint.z + this.calibrationOffset.z
        );
        
        // 确保管线比例正确
        this.pipelineGroup.scale.set(this.realWorldScale, this.realWorldScale, this.realWorldScale);
    }
    
    createFallbackAnchorAtPosition(position) {
        // 移除旧的锚点
        if (this.fallbackAnchor) {
            this.anchorGroup.remove(this.fallbackAnchor);
        }
        
        // 创建新的锚点标记
        this.fallbackAnchor = this.createAnchorObject();
        this.fallbackAnchor.position.copy(position);
        this.anchorGroup.add(this.fallbackAnchor);
        
        // 将管线绑定到锚点
        this.attachPipelinesToFallbackAnchor(position);
        
        this.isAnchored = true;
        this.updateAnchorStatus('fallback_anchored');
    }
    
    attachPipelinesToFallbackAnchor(anchorPosition) {
        if (this.pipelineGroup) {
            // 保持管线在场景中，直接设置位置
            if (this.pipelineGroup.parent !== this.scene) {
                this.pipelineGroup.parent.remove(this.pipelineGroup);
                this.scene.add(this.pipelineGroup);
            }
            
            // 管线位置通过 bindPipelinesToGround 方法设置
        }
    }
    
    async stopFallbackMode() {
        this.isFallbackMode = false;
        this.groundCalibrated = false;
        
        // 移除事件监听
        this.canvasElement.removeEventListener('click', this.fallbackClickHandler, false);
        this.canvasElement.removeEventListener('touchstart', this.fallbackTouchHandler, { passive: false });
        
        // 清理锚点
        if (this.fallbackAnchor) {
            this.anchorGroup.remove(this.fallbackAnchor);
            this.fallbackAnchor = null;
        }
        
        // 清理校准标记
        if (this.calibrationMarker) {
            this.scene.remove(this.calibrationMarker);
            if (this.calibrationMarker.geometry?.dispose()) {}
            this.calibrationMarker = null;
        }
        
        // 清理地面平面
        if (this.fallbackGround) {
            this.scene.remove(this.fallbackGround);
            this.fallbackGround.geometry?.dispose();
            this.fallbackGround.material?.dispose();
            this.fallbackGround = null;
        }
        
        // 重置地面零点
        this.groundZeroPoint.set(0, 0, 0);
        
        // 将管线位置重置
        if (this.pipelineGroup) {
            this.pipelineGroup.position.set(
                this.calibrationOffset.x,
                this.calibrationOffset.y + this.virtualHeight,
                this.calibrationOffset.z
            );
            this.pipelineGroup.scale.set(this.scale, this.scale, this.scale);
        }
        
        this.isAnchored = false;
        this.updateAnchorStatus('disconnected');
        Utils.showToast('地面校准模式已关闭');
    }
    
    // ==================== 增强版锚定方法 ====================
    
    updateAnchorStatus(status) {
        if (this.onAnchorStatus) {
            this.onAnchorStatus(status);
        }
        
        const badge = document.getElementById('anchor-status');
        if (badge) {
            badge.className = '';
            badge.classList.add('status-badge');
            
            switch (status) {
                case 'ready':
                    badge.classList.add('warning');
                    badge.textContent = '锚点: 待设置(WebXR)';
                    break;
                case 'anchored':
                    badge.classList.add('active');
                    badge.textContent = '锚点: 已锁定(WebXR)';
                    break;
                case 'fallback_ready':
                    badge.classList.add('warning');
                    badge.textContent = '地面: 待校准';
                    break;
                case 'fallback_anchored':
                    badge.classList.add('active');
                    badge.textContent = '地面: 已校准';
                    break;
                case 'error':
                    badge.classList.add('error');
                    badge.textContent = '锚点: 错误';
                    break;
                default:
                    badge.textContent = '锚点: 未连接';
            }
        }
    }
    
    clearAnchors() {
        if (this.isFallbackMode) {
            // 清理地面校准模式锚点
            if (this.fallbackAnchor) {
                this.anchorGroup.remove(this.fallbackAnchor);
                this.fallbackAnchor = null;
            }
            
            // 隐藏校准标记
            if (this.calibrationMarker) {
                this.calibrationMarker.visible = false;
            }
            
            // 重置地面校准状态
            this.groundCalibrated = false;
            this.groundZeroPoint.set(0, 0, 0);
            
            // 将管线移回场景并重置位置
            if (this.pipelineGroup && this.pipelineGroup.parent !== this.scene) {
                this.pipelineGroup.parent.remove(this.pipelineGroup);
                this.scene.add(this.pipelineGroup);
                this.pipelineGroup.position.set(
                    this.calibrationOffset.x,
                    this.calibrationOffset.y + this.virtualHeight,
                    this.calibrationOffset.z
                );
                this.pipelineGroup.scale.set(this.scale, this.scale, this.scale);
            }
            
            this.isAnchored = false;
            this.updateAnchorStatus('fallback_ready');
            Utils.showToast('地面校准已清除');
        } else {
            // 原有的WebXR锚点清理
            this.anchors.forEach(a => {
                if (a.object) {
                    this.anchorGroup.remove(a.object);
                }
                if (a.anchor && a.anchor.delete) {
                    a.anchor.delete();
                }
            });
            
            this.anchors = [];
            this.mainAnchor = null;
            this.isAnchored = false;
            
            if (this.pipelineGroup && this.anchorGroup) {
                this.anchorGroup.remove(this.pipelineGroup);
                this.scene.add(this.pipelineGroup);
            }
            
            this.updateAnchorStatus('ready');
            Utils.showToast('锚点已清除');
        }
    }
    
    destroy() {
        if (this.gpsWatchId) {
            navigator.geolocation.clearWatch(this.gpsWatchId);
        }
        
        if (this.xrSession) {
            this.xrSession.end().catch(() => {});
        }
        
        // 清理地面检测系统
        if (this.groundDetectionSystem) {
            this.groundDetectionSystem.destroy();
            this.groundDetectionSystem = null;
        }
        
        // 清理备用模式
        if (this.isFallbackMode) {
            this.stopFallbackMode().catch(() => {});
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

const Utils = {
    EARTH_RADIUS: 6371000,
    DEBUG_MODE: false,

    wgs84ToLocal: function(lat1, lon1, lat2, lon2, alt = 0) {
        const dLat = this.toRadians(lat2 - lat1);
        const dLon = this.toRadians(lon2 - lon1);
        
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                  Math.cos(this.toRadians(lat1)) * Math.cos(this.toRadians(lat2)) *
                  Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        const angularDistance = c;
        
        const bearing = Math.atan2(
            Math.sin(dLon) * Math.cos(this.toRadians(lat2)),
            Math.cos(this.toRadians(lat1)) * Math.sin(this.toRadians(lat2)) -
            Math.sin(this.toRadians(lat1)) * Math.cos(this.toRadians(lat2)) * Math.cos(dLon)
        );
        
        const distance = this.EARTH_RADIUS * angularDistance;
        const x = Math.sin(bearing) * distance;
        const z = Math.cos(bearing) * distance;
        const y = -alt;
        
        return { x, y, z };
    },

    calculateCameraFOV: function() {
        const isMobile = this.isMobileDevice();
        const aspect = window.innerWidth / window.innerHeight;
        
        // 根据设备类型和屏幕比例动态计算FOV，
        // 确保管线透视与真实世界匹配
        if (isMobile) {
            // 移动端使用更宽的FOV以增强沉浸感
            if (aspect > 1) { // 横屏
                return 60;
            } else { // 竖屏
                return 70;
            }
        } else {
            // 桌面端
            return 60;
        }
    },
    
    // 计算真实世界比例（用于管线尺寸校准）
    calculateRealWorldScale: function(distanceToGround) {
        // 根据相机到地面的距离计算比例，
        // 确保 1 米虚拟管线 = 1 米真实长度
        // 简化实现：使用固定比例，可通过用户界面微调
        return 1.0;
    },

    toRadians: function(degrees) {
        return degrees * Math.PI / 180;
    },

    toDegrees: function(radians) {
        return radians * 180 / Math.PI;
    },

    calculateDistance: function(lat1, lon1, lat2, lon2) {
        const dLat = this.toRadians(lat2 - lat1);
        const dLon = this.toRadians(lon2 - lon1);
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                  Math.cos(this.toRadians(lat1)) * Math.cos(this.toRadians(lat2)) *
                  Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return this.EARTH_RADIUS * c;
    },

    debounce: function(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    },

    throttle: function(func, limit) {
        let inThrottle;
        return function(...args) {
            if (!inThrottle) {
                func.apply(this, args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        };
    },

    showToast: function(message, duration = 3000) {
        const toast = document.getElementById('toast');
        if (!toast) {
            console.log('Toast:', message);
            return;
        }
        toast.textContent = message;
        toast.classList.remove('hidden');
        setTimeout(() => {
            toast.classList.add('hidden');
        }, duration);
    },

    updateLoadingStatus: function(status) {
        const loadingStatus = document.getElementById('loading-status');
        if (loadingStatus) {
            loadingStatus.textContent = status;
        }
        console.log('Loading:', status);
    },

    clamp: function(value, min, max) {
        return Math.min(Math.max(value, min), max);
    },

    lerp: function(start, end, t) {
        return start + (end - start) * t;
    },

    isMobileDevice: function() {
        return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    },

    logError: function(tag, error) {
        console.error(`[${tag}]`, error);
    },

    logInfo: function(tag, message) {
        if (this.DEBUG_MODE) {
            console.info(`[${tag}]`, message);
        }
    },

    decimalToDMS: function(decimal, isLatitude) {
        const degrees = Math.floor(Math.abs(decimal));
        const minutesFloat = (Math.abs(decimal) - degrees) * 60;
        const minutes = Math.floor(minutesFloat);
        const seconds = ((minutesFloat - minutes) * 60).toFixed(1);
        
        let direction = '';
        if (isLatitude) {
            direction = decimal >= 0 ? 'N' : 'S';
        } else {
            direction = decimal >= 0 ? 'E' : 'W';
        }
        
        return `${direction} ${degrees}°${minutes}'${seconds}"`;
    },
    
    isWebXRSupported: async function() {
        const diagnostics = [];
        
        // 1. 检查 WebXR 支持
        if (!navigator.xr) {
            diagnostics.push('❌ 浏览器不支持WebXR API');
            return { 
                supported: false, 
                reason: '浏览器不支持WebXR',
                diagnostics: diagnostics,
                fallbackMode: true
            };
        }
        diagnostics.push('✅ 浏览器支持WebXR API');
        
        // 2. 检查是否在HTTPS或localhost环境（WebXR要求）
        const isSecureContext = window.isSecureContext;
        if (!isSecureContext) {
            diagnostics.push('⚠️ 不在安全上下文中（需要HTTPS或localhost）');
        } else {
            diagnostics.push('✅ 处于安全上下文');
        }
        
        // 3. 检测设备类型
        const isMobile = this.isMobileDevice();
        diagnostics.push(isMobile ? '📱 检测到移动设备' : '💻 检测到桌面设备');
        
        try {
            // 4. 检查 immersive-ar 支持
            const arSupported = await navigator.xr.isSessionSupported('immersive-ar');
            if (!arSupported) {
                diagnostics.push('❌ 设备不支持AR沉浸式会话');
                
                // 检查是否支持 VR
                const vrSupported = await navigator.xr.isSessionSupported('immersive-vr');
                if (vrSupported) {
                    diagnostics.push('ℹ️ 设备支持VR但不支持AR');
                }
                
                return { 
                    supported: false, 
                    reason: '设备不支持AR沉浸式会话',
                    diagnostics: diagnostics,
                    fallbackMode: true
                };
            }
            diagnostics.push('✅ 设备支持AR沉浸式会话');
            
            // 5. 检查可选功能支持
            try {
                const testSession = await navigator.xr.requestSession('immersive-ar', {
                    requiredFeatures: ['local'],
                    optionalFeatures: ['hit-test', 'plane-detection', 'anchors']
                });
                await testSession.end();
                diagnostics.push('✅ 支持ARCore/ARKit核心功能');
            } catch (e) {
                diagnostics.push('⚠️ 部分AR功能可能受限: ' + e.message);
            }
            
            return { 
                supported: true, 
                reason: null,
                diagnostics: diagnostics,
                fallbackMode: false
            };
        } catch (error) {
            diagnostics.push('❌ WebXR检测出错: ' + error.message);
            return { 
                supported: false, 
                reason: error.message,
                diagnostics: diagnostics,
                fallbackMode: true
            };
        }
    },
    
    getDeviceCapabilities: function() {
        return {
            userAgent: navigator.userAgent,
            platform: navigator.platform,
            vendor: navigator.vendor,
            language: navigator.language,
            isMobile: this.isMobileDevice(),
            isSecureContext: window.isSecureContext,
            webGLSupport: !!window.WebGLRenderingContext,
            webGL2Support: !!window.WebGL2RenderingContext,
            deviceMemory: navigator.deviceMemory || 'unknown',
            hardwareConcurrency: navigator.hardwareConcurrency || 'unknown',
            touchSupport: 'ontouchstart' in window
        };
    },
    
    getXRDeviceInfo: function() {
        const info = {
            webxr: !!navigator.xr,
            mobile: this.isMobileDevice(),
            userAgent: navigator.userAgent,
            language: navigator.language
        };
        return info;
    },
    
    createVRButton: function(renderer, sessionInit, onStart, onEnd) {
        const button = document.createElement('button');
        button.style.display = 'none';
        
        function showStartAR() {
            button.textContent = '启动 AR';
            button.style.display = '';
            
            button.onmouseenter = () => button.style.opacity = '1.0';
            button.onmouseleave = () => button.style.opacity = '0.5';
            
            button.onclick = () => {
                button.style.display = 'none';
                onStart();
            };
        }
        
        function showEndAR() {
            button.textContent = '退出 AR';
            button.style.display = '';
            
            button.onmouseenter = () => button.style.opacity = '1.0';
            button.onmouseleave = () => button.style.opacity = '0.5';
            
            button.onclick = () => {
                button.style.display = 'none';
                onEnd();
            };
        }
        
        async function checkAvailability() {
            const xrSupport = await Utils.isWebXRSupported();
            if (xrSupport.supported) {
                showStartAR();
            } else {
                button.textContent = 'AR不可用';
                button.style.display = '';
                button.style.opacity = '0.5';
            }
        }
        
        checkAvailability();
        
        return button;
    },
    
    clampToPlane: function(point, planeNormal, planePoint) {
        const v = new THREE.Vector3().subVectors(point, planePoint);
        const distance = v.dot(planeNormal);
        return new THREE.Vector3().subVectors(point, planeNormal.clone().multiplyScalar(distance));
    }
};

export { Utils };

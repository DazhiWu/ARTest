import { Utils } from './utils.js';

class PipelineLoader {
    constructor(arCore) {
        this.arCore = arCore;
        this.pipelines = [];
        this.pipelineMeshes = [];
        this.locationMarkers = [];
        this.visibleLayers = {
            water: true,
            drainage: true,
            power: true,
            gas: true
        };
        this.minDepth = 0;
        this.maxDepth = 10;
        
        this.typeColors = {
            water: 0x2196F3,
            drainage: 0x4CAF50,
            power: 0xFFEB3B,
            gas: 0xF44336
        };
        
        this.typeNames = {
            water: '给水',
            drainage: '排水',
            power: '电力',
            gas: '燃气'
        };
    }

    async loadData(dataUrl) {
        try {
            const response = await fetch(dataUrl);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const text = await response.text();
            const lines = text.trim().split('\n');
            
            this.pipelines = lines.map(line => {
                try {
                    const feature = JSON.parse(line);
                    return this.convertGeoJSONToPipeline(feature);
                } catch (e) {
                    console.warn('解析行失败:', line, e);
                    return null;
                }
            }).filter(p => p !== null);
            
            Utils.updateLoadingStatus(`已加载 ${this.pipelines.length} 条管线数据`);
            return this.pipelines;
        } catch (error) {
            console.error('加载管线数据失败:', error);
            Utils.showToast('加载管线数据失败');
            return [];
        }
    }

    convertGeoJSONToPipeline(feature) {
        const props = feature.properties || {};
        const geometry = feature.geometry || {};
        const coordinates = geometry.coordinates || [];
        
        const typeMap = {
            '供水管道': 'water',
            '排水管道': 'drainage',
            '电力管道': 'power',
            '燃气管道': 'gas'
        };
        
        const type = typeMap[props.gdlx] || 'water';
        const depth = 2; 
        
        return {
            id: props.gxbh || `PIPE-${Date.now()}`,
            type: type,
            depth: depth,
            diameter: parseInt(props.gj) || 300,
            material: props.cz || '未知',
            buildYear: props.lrsj ? props.lrsj.substring(0, 4) : '未知',
            owner: props.cldw || '未知',
            points: coordinates.map(coord => ({
                lng: coord[0],
                lat: coord[1]
            }))
        };
    }

    setData(pipelines) {
        this.pipelines = pipelines;
    }

    generatePipelines(originLat, originLng) {
        Utils.updateLoadingStatus('正在生成管线模型...');
        
        this.arCore.clearPipelines();
        this.pipelineMeshes = [];
        this.clearLocationMarkers();
        
        this.pipelines.forEach((pipeline, index) => {
            const mesh = this.createPipelineMesh(pipeline, originLat, originLng);
            if (mesh) {
                this.pipelineMeshes.push(mesh);
                this.arCore.addPipeline(mesh);
            }
            
            this.createLocationMarkers(pipeline, originLat, originLng);
        });
        
        Utils.updateLoadingStatus(`已生成 ${this.pipelineMeshes.length} 条管线`);
        this.updateVisibility();
        
        return this.pipelineMeshes;
    }

    createPipelineMesh(pipeline, originLat, originLng) {
        const points = pipeline.points || [];
        if (points.length < 2) {
            console.warn('管线数据点不足:', pipeline.id);
            return null;
        }

        const targetDepth = pipeline.depth || 2;

        const curvePoints = points.map(point => {
            let x, y, z;
            
            if (originLat === 0 && originLng === 0) {
                x = point.lng * 10000;
                z = point.lat * 10000;
                y = -targetDepth;
            } else {
                const localCoords = Utils.wgs84ToLocal(
                    originLat,
                    originLng,
                    point.lat,
                    point.lng,
                    targetDepth
                );
                x = localCoords.x;
                y = localCoords.y;
                z = localCoords.z;
            }
            
            return new THREE.Vector3(x, y, z);
        });

        const curve = new THREE.CatmullRomCurve3(curvePoints);
        const tubeRadius = (pipeline.diameter || 300) / 2000;
        const geometry = new THREE.TubeGeometry(curve, Math.max(points.length * 2, 20), tubeRadius, 8, false);

        const color = this.typeColors[pipeline.type] || 0x999999;
        const material = new THREE.MeshPhongMaterial({
            color: color,
            transparent: true,
            opacity: 0.92,
            shininess: 30,
            specular: new THREE.Color(0x222222),
            emissive: new THREE.Color(0x000000),
            emissiveIntensity: 0.0,
            depthTest: true,
            depthWrite: true,
            polygonOffset: true,
            polygonOffsetFactor: -1,
            polygonOffsetUnits: -1
        });

        const mesh = new THREE.Mesh(geometry, material);
        mesh.renderOrder = 1;
        
        mesh.userData.pipelineInfo = {
            id: pipeline.id,
            type: this.typeNames[pipeline.type] || pipeline.type,
            typeKey: pipeline.type,
            diameter: pipeline.diameter || '未知',
            material: pipeline.material || '未知',
            depth: targetDepth,
            buildYear: pipeline.buildYear || '未知',
            owner: pipeline.owner || '未知'
        };

        return mesh;
    }

    setLayerVisibility(layer, visible) {
        if (this.visibleLayers.hasOwnProperty(layer)) {
            this.visibleLayers[layer] = visible;
            this.updateVisibility();
        }
    }

    updateVisibility() {
        this.pipelineMeshes.forEach(mesh => {
            const info = mesh.userData.pipelineInfo;
            if (info) {
                const typeVisible = this.visibleLayers[info.typeKey];
                const depthInRange = info.depth >= this.minDepth && info.depth <= this.maxDepth;
                mesh.visible = typeVisible && depthInRange;
            }
        });
    }

    setDepthRange(min, max) {
        this.minDepth = min;
        this.maxDepth = max;
        this.updateVisibility();
    }

    highlightPipeline(pipelineId) {
        this.pipelineMeshes.forEach(mesh => {
            const info = mesh.userData.pipelineInfo;
            if (info && info.id === pipelineId) {
                mesh.material.emissive = new THREE.Color(0xffff00);
                mesh.material.emissiveIntensity = 0.5;
            } else if (mesh.material.emissive) {
                mesh.material.emissive.setHex(0x000000);
                mesh.material.emissiveIntensity = 0;
            }
        });
    }

    clearHighlight() {
        this.pipelineMeshes.forEach(mesh => {
            if (mesh.material.emissive) {
                mesh.material.emissive.setHex(0x000000);
                mesh.material.emissiveIntensity = 0;
            }
        });
    }

    createTestPipelines() {
        const testPipelines = [
            {
                id: 'TEST-WL-001',
                type: 'water',
                depth: 2,
                diameter: 400,
                material: '测试PE管',
                buildYear: '2024',
                owner: '测试单位',
                points: [
                    { lng: 0, lat: 0 },
                    { lng: 0, lat: 0.0001 },
                    { lng: 0.0001, lat: 0.0001 }
                ]
            },
            {
                id: 'TEST-DR-001',
                type: 'drainage',
                depth: 3,
                diameter: 600,
                material: '测试混凝土管',
                buildYear: '2024',
                owner: '测试单位',
                points: [
                    { lng: 0, lat: 0 },
                    { lng: 0.0001, lat: 0 },
                    { lng: 0.0001, lat: -0.0001 }
                ]
            },
            {
                id: 'TEST-PL-001',
                type: 'power',
                depth: 1.5,
                diameter: 200,
                material: '测试电缆管',
                buildYear: '2024',
                owner: '测试单位',
                points: [
                    { lng: 0, lat: 0 },
                    { lng: -0.0001, lat: 0 },
                    { lng: -0.0001, lat: 0.0001 }
                ]
            },
            {
                id: 'TEST-GL-001',
                type: 'gas',
                depth: 2.5,
                diameter: 250,
                material: '测试燃气管',
                buildYear: '2024',
                owner: '测试单位',
                points: [
                    { lng: 0, lat: 0 },
                    { lng: 0, lat: -0.0001 },
                    { lng: -0.0001, lat: -0.0001 }
                ]
            }
        ];

        this.pipelines = testPipelines;
        this.generatePipelines(0, 0);
    }

    createLocationMarkers(pipeline, originLat, originLng) {
        const points = pipeline.points || [];
        
        points.forEach((point, index) => {
            let x, y, z;
            
            if (originLat === 0 && originLng === 0) {
                x = point.lng * 10000;
                z = point.lat * 10000;
                y = 0;
            } else {
                const localCoords = Utils.wgs84ToLocal(
                    originLat,
                    originLng,
                    point.lat,
                    point.lng,
                    0
                );
                x = localCoords.x;
                y = 0;
                z = localCoords.z;
            }
            
            const arrow = this.createRedArrow();
            arrow.position.set(x, y + 5, z);
            this.locationMarkers.push(arrow);
            this.arCore.scene.add(arrow);
            
            const textSprite = this.createTextSprite(
                Utils.decimalToDMS(point.lat, true) + ' ' + Utils.decimalToDMS(point.lng, false)
            );
            textSprite.position.set(x, y + 12, z);
            this.locationMarkers.push(textSprite);
            this.arCore.scene.add(textSprite);
        });
    }

    createRedArrow() {
        const arrowLength = 10;
        const arrowHeadLength = 2;
        const arrowHeadWidth = 1;
        
        const cylinderGeometry = new THREE.CylinderGeometry(0.2, 0.2, arrowLength - arrowHeadLength, 8);
        const coneGeometry = new THREE.ConeGeometry(arrowHeadWidth, arrowHeadLength, 8);
        
        const redMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000 });
        
        const cylinder = new THREE.Mesh(cylinderGeometry, redMaterial);
        cylinder.position.y = (arrowLength - arrowHeadLength) / 2;
        
        const cone = new THREE.Mesh(coneGeometry, redMaterial);
        cone.position.y = arrowLength - arrowHeadLength / 2;
        
        const arrowGroup = new THREE.Group();
        arrowGroup.add(cylinder);
        arrowGroup.add(cone);
        
        arrowGroup.rotation.x = Math.PI;
        
        return arrowGroup;
    }

    createTextSprite(text) {
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.width = 512;
        canvas.height = 128;
        
        context.fillStyle = 'rgba(0, 0, 0, 0.8)';
        context.fillRect(0, 0, canvas.width, canvas.height);
        
        context.font = '24px Arial';
        context.fillStyle = 'white';
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillText(text, canvas.width / 2, canvas.height / 2);
        
        const texture = new THREE.CanvasTexture(canvas);
        const material = new THREE.SpriteMaterial({ map: texture });
        const sprite = new THREE.Sprite(material);
        
        sprite.scale.set(15, 4, 1);
        
        return sprite;
    }

    clearLocationMarkers() {
        this.locationMarkers.forEach(marker => {
            this.arCore.scene.remove(marker);
        });
        this.locationMarkers = [];
    }
}

export { PipelineLoader };

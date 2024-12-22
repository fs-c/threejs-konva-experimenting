// @ts-expect-error no types for styling
import './style.css';

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTF, GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import Konva from 'konva';

class AsyncGLTFLoader {
    private readonly loader = new GLTFLoader();

    public async load(url: string): Promise<GLTF> {
        return new Promise((resolve, reject) => {
            this.loader.load(
                url,
                (gltf) => {
                    resolve(gltf);
                },
                undefined,
                reject
            );
        });
    }
}

const initializeKonva = (container: HTMLDivElement): { layer: Konva.Layer; stage: Konva.Stage } => {
    const containerDimensions = container.getBoundingClientRect();
    const height = Math.min(containerDimensions.width, containerDimensions.height);
    const width = height;

    const stage = new Konva.Stage({
        container,
        width,
        height,
    });

    const layer = new Konva.Layer();
    stage.add(layer);

    const background = new Konva.Rect({
        width: stage.width(),
        height: stage.height(),
        fill: '#FFD2A0',
    });
    layer.add(background);

    const circle = new Konva.Circle({
        x: stage.width() / 2,
        y: stage.height() / 2,
        radius: 70,
        fill: '#A888B5',
        stroke: '#8174A0',
        strokeWidth: 4,
        draggable: true,
    });
    layer.add(circle);

    const transformer = new Konva.Transformer();
    layer.add(transformer);

    transformer.nodes([circle]);

    return { layer, stage };
};

const initializeThree = (
    container: HTMLElement,
    canvas: HTMLCanvasElement
): {
    updateTexture: () => {};
    camera: THREE.PerspectiveCamera;
    scene: THREE.Scene;
    controls: OrbitControls;
    renderer: THREE.WebGLRenderer;
} => {
    const { width, height } = container.getBoundingClientRect();

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(window.devicePixelRatio);
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('white');

    const camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
    camera.position.z = 5;

    renderer.setAnimationLoop(() => {
        renderer.render(scene, camera);
    });

    const planeTexture = new THREE.CanvasTexture(canvas);
    const planeMaterial = new THREE.MeshBasicMaterial({ map: planeTexture });
    const planeGeometry = new THREE.PlaneGeometry(2, 2);

    const plane = new THREE.Mesh(planeGeometry, planeMaterial);
    scene.add(plane);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.mouseButtons.LEFT = undefined;
    controls.mouseButtons.RIGHT = THREE.MOUSE.ROTATE;

    return {
        updateTexture: () => (planeTexture.needsUpdate = true),
        scene,
        camera,
        controls,
        renderer,
    };
};

const getUVRectangleForMaterial = (model: THREE.Group<THREE.Object3DEventMap>): { width: number; height: number } => {
    model.traverse((node) => {
        if (!node.isMesh || )
    })
};

const konvaContainer = document.getElementById('konva-container');
if (!konvaContainer || !(konvaContainer instanceof HTMLDivElement)) {
    throw new Error('Konva container not found or not a <div>');
}

const threeContainer = document.getElementById('three-container');
if (!threeContainer) {
    throw new Error('Three container not found');
}

const { layer, stage } = initializeKonva(konvaContainer);

const { width, height } = threeContainer.getBoundingClientRect();

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(width, height);
renderer.setPixelRatio(window.devicePixelRatio);
threeContainer.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color('white');

const camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
camera.position.z = 5;

renderer.setAnimationLoop(() => {
    renderer.render(scene, camera);
});

const loader = new AsyncGLTFLoader();
const model = (await loader.load('assets/ugly-cup-4.glb')).scene;

const planeTexture = new THREE.CanvasTexture(canvas);
const planeMaterial = new THREE.MeshBasicMaterial({ map: planeTexture });
const planeGeometry = new THREE.PlaneGeometry(2, 2);

const plane = new THREE.Mesh(planeGeometry, planeMaterial);
scene.add(plane);

const controls = new OrbitControls(camera, renderer.domElement);
controls.mouseButtons.LEFT = undefined;
controls.mouseButtons.RIGHT = THREE.MOUSE.ROTATE;

// // this property is not documented
// const konvaCanvas = layer.getCanvas()._canvas;
// const { updateTexture, camera, scene, controls, renderer } = initializeThree(
//     threeContainer,
//     konvaCanvas
// );

layer.on('draw', () => {
    updateTexture();
});

{
    const raycaster = new THREE.Raycaster();
    const normalizedCoordinates = new THREE.Vector2();

    const rendererBoundingRect = renderer.domElement.getBoundingClientRect();

    /**
     * maps a mouse event which occured on the threejs canvas to the corresponding
     * position on the konva canvas
     */
    const mapThreeEventToKonvaPosition = (
        event: MouseEvent
    ): { x: number; y: number } | undefined => {
        const relativeThreeX =
            (event.clientX - rendererBoundingRect.left) *
            (renderer.domElement.width / rendererBoundingRect.width);
        const relativeThreeY =
            (event.clientY - rendererBoundingRect.top) *
            (renderer.domElement.height / rendererBoundingRect.height);

        normalizedCoordinates.x = (relativeThreeX / renderer.domElement.width) * 2 - 1;
        normalizedCoordinates.y = -(relativeThreeY / renderer.domElement.height) * 2 + 1;

        // perf: should only update this if the camera has changed
        camera.updateProjectionMatrix();

        raycaster.setFromCamera(normalizedCoordinates, camera);
        controls.update();

        const intersects = raycaster.intersectObjects(scene.children, false);
        const intersectUv = intersects[0]?.uv;
        if (intersectUv == null) {
            return undefined;
        }

        return {
            x: intersectUv.x * stage.width(),
            // threejs uv-coordinates have their origin in the bottom left (not top left)
            // yes this is different from basically all other implementations
            y: (1 - intersectUv.y) * stage.height(),
        };
    };

    /**
     * we are passing events from the threejs canvas to the konva canvas
     * konva checks that a drag has ended by always listening to mouseMove/mouseUp
     * on the window, so we dispatch those events on there
     * this is only tested for basic transformer interaction, it seems likely that
     * there are some other edge cases in which events need to be dispatched slightly
     * differently, eg. with more/other properties
     * stopping propagation is important to prevent the original event from also being
     * handled by konva (since, while dragging, it will treat all mouse move events as
     * being part of the same drag) which would break everything
     */

    const handleEventWrapper = (
        handler: (position: { x: number; y: number }) => void
    ): ((event: MouseEvent) => void) => {
        return (event: MouseEvent) => {
            if (event.button !== 0) {
                return;
            }

            const position = mapThreeEventToKonvaPosition(event);
            if (position == null) {
                return;
            }

            event.stopPropagation();
            handler(position);
        };
    };

    const handleMouseDown = handleEventWrapper(({ x, y }) => {
        stage.content.dispatchEvent(new MouseEvent('mousedown', { clientX: x, clientY: y }));
    });

    const handleMouseMove = handleEventWrapper(({ x, y }) => {
        window.dispatchEvent(new MouseEvent('mousemove', { clientX: x, clientY: y }));
    });

    const handleMouseUp = handleEventWrapper(({ x, y }) => {
        window.dispatchEvent(new MouseEvent('mouseup', { clientX: x, clientY: y }));
    });

    renderer.domElement.addEventListener('mousedown', handleMouseDown);
    renderer.domElement.addEventListener('mousemove', handleMouseMove);
    renderer.domElement.addEventListener('mouseup', handleMouseUp);
}

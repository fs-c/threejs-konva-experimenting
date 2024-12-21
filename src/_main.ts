import './style.css';

import * as THREE from 'three';
import Konva from 'konva';
import { GLTF, GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// this is giga-ugly but i didn't find a way to extract dimensions from the model
const CUP_ASPECT_RATIO = 6.272 / 2;

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

function initializeKonva() {
    const container = document.getElementById('konva-container');
    if (!container) {
        throw new Error('Konva container not found');
    }

    const konvaWidth = container.offsetWidth;
    const konvaHeight = konvaWidth / CUP_ASPECT_RATIO;

    container.onclick = (event) => {
        console.log('konva click', event);
    };

    console.log({ konvaWidth, konvaHeight });

    const stage = new Konva.Stage({
        container: 'konva-container',
        width: konvaWidth,
        height: konvaHeight,
    });

    const layer = new Konva.Layer();
    stage.add(layer);

    const background = new Konva.Rect({
        width: stage.width(),
        height: stage.height(),
        fill: 'black',
    });
    layer.add(background);

    const circle = new Konva.Circle({
        x: stage.width() / 2,
        y: stage.height() / 2,
        radius: 70,
        fill: '#1e40af',
        stroke: 'black',
        strokeWidth: 4,
        draggable: true,
    });
    layer.add(circle);

    const transformer = new Konva.Transformer();
    layer.add(transformer);

    transformer.nodes([circle]);

    // undefined behavior: konva SceneCanvas#_canvas isn't documented
    const canvas = layer.getCanvas()._canvas;

    circle.on('transform', () => {
        console.log('transform', circle.x(), circle.y());
    });

    return { container, canvas, stage, transformer, layer };
}

const konvaConstants = initializeKonva();

const threeContainer = document.getElementById('three-container');
if (!threeContainer) {
    throw new Error('Three container not found');
}

const threeContainerBoundingClientRect = threeContainer.getBoundingClientRect();
const { width: threeWidth, height: threeHeight } =
    threeContainerBoundingClientRect;

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(threeWidth, threeHeight);

threeContainer.appendChild(renderer.domElement);

const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(
    75,
    threeWidth / threeHeight,
    0.1,
    1000
);
camera.position.z = 5;

const controls = new OrbitControls(camera, renderer.domElement);
controls.mouseButtons.LEFT = undefined;
controls.mouseButtons.RIGHT = THREE.MOUSE.ROTATE;

const canvasTexture = new THREE.CanvasTexture(konvaConstants.canvas);

// canvasTexture.wrapS = THREE.RepeatWrapping;
// canvasTexture.repeat.x = -1;

const canvasMaterial = new THREE.MeshStandardMaterial({
    map: canvasTexture,
});

const gltfLoader = new AsyncGLTFLoader();
const gltf = await gltfLoader.load('assets/ugly-cup-3.glb');

const cup = gltf.scene;

cup.traverse((child) => {
    if (
        !(child instanceof THREE.Mesh) ||
        child.material.name !== 'outer-material'
    ) {
        return;
    }

    child.material = canvasMaterial;
});

scene.add(cup);

scene.add(new THREE.AmbientLight(0xffffff, 0.5));

const light = new THREE.DirectionalLight(0xffffff, 1);
light.position.set(0, 0, 1);
scene.add(light);

scene.background = new THREE.Color(0xffffff);

const raycaster = new THREE.Raycaster();
const clickEventPosition = new THREE.Vector2();

function uvToPixel(uv: THREE.Vector2, width: number, height: number) {
    return {
        x: uv.x * width,
        y: (1 - uv.y) * height,
    };
}

const konvaContainerBoundingClientRect =
    konvaConstants.container.getBoundingClientRect();

const konvaStageSize = {
    width: konvaConstants.stage.width(),
    height: konvaConstants.stage.height(),
};

function getKonvaPositionFromThreeEvent(event: MouseEvent) {
    // so apparently these are normalized device coordinates, idk why they are this way
    // https://threejs.org/docs/#api/en/core/Raycaster
    clickEventPosition.x = (event.offsetX / threeWidth) * 2 - 1;
    clickEventPosition.y = -(event.offsetY / threeHeight) * 2 + 1;

    // without this the camera doesn't update and the raycasting doesn't work, but this seems
    // expensive and i think we could get away with calling it less frequently
    camera.updateProjectionMatrix();
    controls.update();

    raycaster.setFromCamera(clickEventPosition, camera);

    const intersects = raycaster.intersectObjects(scene.children, true);

    console.log(intersects);

    const intersectUv = intersects[0]?.uv;
    if (intersectUv == null) {
        return null;
    }

    // this should be required but ¯\_(ツ)_/¯
    // intersects[0].object.material.map.transformUv(intersectUv);

    const positionInContainer = uvToPixel(
        intersectUv,
        konvaStageSize.width,
        konvaStageSize.height
    );
    return {
        x: positionInContainer.x + konvaContainerBoundingClientRect.left,
        y: positionInContainer.y + konvaContainerBoundingClientRect.top,
    };
}

function setupWindowEventPassthrough(source: HTMLElement) {
    const eventNamesWithState = [
        ['mousedown', true],
        ['mousemove', undefined],
        ['mouseup', false],
    ] as const;

    let isHoldingMouseDown = false;

    for (const [eventName, newMouseDownState] of eventNamesWithState) {
        source.addEventListener(eventName, (event) => {
            if (event.button !== 0) {
                return;
            }

            if (newMouseDownState == null && !isHoldingMouseDown) {
                return;
            }

            if (newMouseDownState != null) {
                isHoldingMouseDown = newMouseDownState;
            }

            const konvaPosition = getKonvaPositionFromThreeEvent(event);
            console.log(eventName, konvaPosition);

            if (konvaPosition != null) {
                const fakeEvent = new MouseEvent(eventName, {
                    bubbles: true,
                    view: window,
                    clientX: konvaPosition.x,
                    clientY: konvaPosition.y,
                });

                console.log('sending fake event', konvaPosition);

                konvaConstants.container.firstChild?.dispatchEvent(fakeEvent);
            }
        });
    }
}

setupWindowEventPassthrough(threeContainer);

function animationLoop() {
    renderer.render(scene, camera);
}
renderer.setAnimationLoop(animationLoop);

konvaConstants.layer.on('draw', () => {
    canvasTexture.needsUpdate = true;
});

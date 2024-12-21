import './style.css';

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import Konva from 'konva';

const initializeKonva = (
    container: HTMLDivElement
): { layer: Konva.Layer; transformer: Konva.Transformer; stage: Konva.Stage } => {
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

    circle.on('dragstart', (evt) => {
        console.log('dragstart', evt.evt.clientX, evt.evt.clientY);
    });

    circle.on('dragmove', (evt) => {
        console.log('dragmove', evt.evt.clientX, evt.evt.clientY);
    });

    circle.on('dragend', (evt) => {
        console.log('dragend', evt.evt.clientX, evt.evt.clientY);
    });

    const transformer = new Konva.Transformer();
    layer.add(transformer);

    transformer.nodes([circle]);

    return { layer, transformer, stage };
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
    scene.background = new THREE.Color(0xeeeeee);

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

const getCanvasForLayer = (layer: Konva.Layer): HTMLCanvasElement => {
    // this is not documented
    return layer.getCanvas()._canvas;
};

const konvaContainer = document.getElementById('konva-container');
if (!konvaContainer || !(konvaContainer instanceof HTMLDivElement)) {
    throw new Error('Konva container not found or not a <div>');
}

const threeContainer = document.getElementById('three-container');
if (!threeContainer) {
    throw new Error('Three container not found');
}

const { layer, transformer, stage } = initializeKonva(konvaContainer);

const setupMouseEventsPassthrough = (
    fromElement: HTMLElement,
    toElement: HTMLElement,
    transformEvent: (event: MouseEvent) => MouseEventInit | undefined
) => {
    const eventNamesWithNewState = [
        ['mousedown', true],
        ['mousemove', undefined],
        ['mouseup', false],
    ] as const;

    let isHoldingMouseDown = false;

    for (const [eventName, newMouseDownState] of eventNamesWithNewState) {
        fromElement.addEventListener(eventName, (event) => {
            if (event.button !== 0) {
                return;
            }

            if (newMouseDownState == null && !isHoldingMouseDown) {
                return;
            }

            if (newMouseDownState != null) {
                isHoldingMouseDown = newMouseDownState;
            }

            const newEventParams = transformEvent(event);
            if (!newEventParams) {
                return;
            }

            // const fakeEvent = new MouseEvent(eventName, newEventParams);
            // toElement.dispatchEvent(fakeEvent);

            console.log('sending fake event', eventName, newEventParams);

            const fn =
                eventName === 'mousedown'
                    ? simulateMouseDown
                    : eventName === 'mousemove'
                    ? simulateMouseMove
                    : simulateMouseUp;

            console.log({
                x: newEventParams.clientX,
                y: newEventParams.clientY,
            });

            fn(stage, {
                x: newEventParams.clientX,
                y: newEventParams.clientY,
            } as any);

            // const fn =
            //     eventName === 'pointerdown'
            //         ? stage._pointerdown
            //         : eventName === 'pointermove'
            //         ? stage._pointermove
            //         : stage._pointerup;

            // fn.call(stage, {
            //     clientX: newEventParams.clientX,
            //     clientY: newEventParams.clientY,
            //     button: 0,
            //     pointerId: 1,
            //     type: eventName,
            // } as any);

            if (eventName !== 'mouseup') {
                event.stopPropagation();
            }
        });
    }
};

const konvaCanvas = getCanvasForLayer(layer);
const { updateTexture, camera, scene, controls, renderer } = initializeThree(
    threeContainer,
    konvaCanvas
);

layer.on('draw', () => {
    updateTexture();
});

{
    const raycaster = new THREE.Raycaster();
    const normalizedCoordinates = new THREE.Vector2();

    const boundingRect = renderer.domElement.getBoundingClientRect();

    console.log(layer.width(), layer.height());

    setupMouseEventsPassthrough(renderer.domElement, konvaContainer, (event) => {
        const relativeX =
            (event.clientX - boundingRect.left) * (renderer.domElement.width / boundingRect.width);
        const relativeY =
            (event.clientY - boundingRect.top) * (renderer.domElement.height / boundingRect.height);

        normalizedCoordinates.x = (relativeX / renderer.domElement.width) * 2 - 1;
        normalizedCoordinates.y = -(relativeY / renderer.domElement.height) * 2 + 1;

        camera.updateProjectionMatrix();

        raycaster.setFromCamera(normalizedCoordinates, camera);
        controls.update();

        const intersects = raycaster.intersectObjects(scene.children, false);
        const intersectUv = intersects[0]?.uv;
        if (intersectUv == null) {
            return undefined;
        }

        const relativePosition = {
            x: intersectUv.x * layer.width(),
            y: (1 - intersectUv.y) * layer.height(),
        };

        return {
            clientX: relativePosition.x,
            clientY: relativePosition.y,
        };
    });
}

function simulateMouseDown(stage: Konva.Stage, pos: { x: number; y: number }) {
    // simulatePointerDown(stage, pos);

    stage._pointerdown(
        new MouseEvent('mousedown', {
            clientX: pos.x,
            clientY: pos.y,
            button: 0,
        })
    );
}

function simulateMouseMove(stage: Konva.Stage, pos: { x: number; y: number }) {
    // simulatePointerMove(stage, pos);

    const event = new MouseEvent('mousemove', {
        clientX: pos.x,
        clientY: pos.y,
        button: 0,
    });

    Konva.DD._drag(event);
    // stage._pointermove(event);
}

function simulateMouseUp(stage: Konva.Stage, pos: { x: number; y: number }) {
    // simulatePointerUp(stage, pos);

    var evt = {
        clientX: pos.x,
        clientY: pos.y,
        button: pos.button || 0,
        type: 'mouseup',
    };
}

function simulatePointerDown(stage: Konva.Stage, pos: { x: number; y: number }) {
    stage._pointerdown({
        clientX: pos.x,
        clientY: pos.y,
        button: pos.button || 0,
        pointerId: pos.pointerId || 1,
        type: 'pointerdown',
    } as any);
}

function simulatePointerMove(stage: Konva.Stage, pos: { x: number; y: number }) {
    var evt = {
        clientX: pos.x,
        clientY: pos.y,
        button: pos.button || 0,
        pointerId: pos.pointerId || 1,
        type: 'pointermove',
    };

    stage._pointermove(evt as any);
}

function simulatePointerUp(stage: Konva.Stage, pos: { x: number; y: number }) {
    var evt = {
        clientX: pos.x,
        clientY: pos.y,
        button: pos.button || 0,
        pointerId: pos.pointerId || 1,
        type: 'pointerup',
    };

    stage._pointerup(evt as any);
}

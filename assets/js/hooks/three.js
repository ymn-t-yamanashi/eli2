import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { VRMLoaderPlugin } from '@pixiv/three-vrm'; // プラグインを登録して GLTFLoader で VRM を扱う


Threejs = {
  v: {},
  mounted() {
    console.log("mounted");
    this.init(this.el);
    this.handleEventInit();
  },
  addCube(name, x, y, z, color) {
    const geometry = new THREE.BoxGeometry(x, y, z);

    // マテリアルを作成
    const material = new THREE.MeshBasicMaterial({ color: color });

    // メッシュ（ジオメトリとマテリアルを組み合わせたもの）を作成
    const cube = new THREE.Mesh(geometry, material);
    this.v.scene.add(cube);
    this.v[name] = cube;
  },
  addPlane(name, x, y, color) {
    const geometry = new THREE.PlaneGeometry(x, y)

    // マテリアルを作成
    // const material = new THREE.MeshBasicMaterial({ color: color });
    const material = new THREE.MeshStandardMaterial({ color: color, side: THREE.DoubleSide }); // ライトに反応する

    // メッシュ（ジオメトリとマテリアルを組み合わせたもの）を作成
    const cube = new THREE.Mesh(geometry, material);
    this.v.scene.add(cube);
    this.v[name] = cube;
  },
  position(name, x, y, z) {
    if (this.v[name] == undefined) return;
    var target = this.v[name];

    // VRM インスタンスなら .scene を使う
    if (target.scene && target.scene instanceof THREE.Object3D) {
      target = target.scene;
    }

    var position = target.position;
    if (!position) return;
    if (x != null) position.x = x;
    if (y != null) position.y = y;
    if (z != null) position.z = z;
  },
  rotation(name, x, y, z) {
    if (this.v[name] == undefined) return;
    var target = this.v[name];

    if (target.scene && target.scene instanceof THREE.Object3D) {
      target = target.scene;
    }

    var rot = target.rotation;
    if (!rot) return;
    if (x != null) rot.x = x;
    if (y != null) rot.y = y;
    if (z != null) rot.z = z;
  },
  rotationBone(name, boneName, x, y, z) {
    if (this.v[name] == undefined) return;
    var modelOrVrm = this.v[name];

    // VRM の場合は .scene に実体がある
    var root = (modelOrVrm.scene && modelOrVrm.scene instanceof THREE.Object3D) ? modelOrVrm.scene : modelOrVrm;

    var bone = root.getObjectByName(boneName);
    if (!bone) {
      console.warn("bone '" + boneName + "' not found on model '" + name + "'");
      return;
    }
    if (x != null) bone.rotation.x = x;
    if (y != null) bone.rotation.y = y;
    if (z != null) bone.rotation.z = z;
  },
  loadModel(name, path) {
    var loader = new GLTFLoader();
    // register VRM plugin (function form to avoid =>)
    loader.register(function (parser) {
      return new VRMLoaderPlugin(parser);
    });

    var self = this;
    var v = this.v;
    var t = this;

    loader.load(
      path,
      function (gltf) {
        // three-vrm は gltf.userData.vrm に VRM オブジェクトを格納する
        var vrm = gltf.userData && gltf.userData.vrm;
        // var vrm = gltf.userData.vrm;
        if (!vrm) {
          console.error('Loaded file is not a VRM or vrm not found in gltf.userData.');
          t.pushEvent('load_model', { status: 'error', name: name, message: 'not a VRM' });
          return;
        }

        // optional: VRM の向き調整
        vrm.scene.rotation.y = Math.PI;

        // シーンへ追加 & キャッシュ
        v.scene.add(vrm.scene);
        v[name] = vrm; // VRM オブジェクトを保存（expressionManager 等を使えるように）
        v[name + '_gltf'] = gltf;

        // レンダーループで vrm.update を呼ぶためにキャッシュ
        if (!v._vrms) v._vrms = [];
        v._vrms.push(vrm);
        t.pushEvent('load_model', { status: 'completion', name: name });

      },
      function (xhr) {
        if (xhr && xhr.total) {
          console.log(Math.floor((xhr.loaded / xhr.total) * 100) + '% loaded');
        }
      },
      function (error) {
        console.error('An error happened while loading VRM', error);
        t.pushEvent('load_model', { status: 'error', name: name, error: String(error) });
      }
    );
  },
  getBone(name) {
    if (this.v[name] == undefined) return;
    const t = this
    const model = this.v[name];
    model.traverse((obj) => { if (obj.isBone) t.pushEvent('get_bone', { name: obj.name }) });
  },
  setBlendShape(name, key, value) {
    const vrm = this.v[name];
    vrm.expressionManager.setValue(key, value);
    vrm.expressionManager.update();
  },
  loadTexture(name, path) {
    const v = this.v
    const t = this;
    const textureLoader = new THREE.TextureLoader();
    textureLoader.load(path,
      // 読み込み成功時のコールバック
      function (texture) {
        v[name] = new THREE.MeshBasicMaterial({ map: texture });
        t.pushEvent('load_texture', { status: "completion", name: name })
      },
      // 読み込み進捗時のコールバック (オプション)
      undefined,
      // 読み込みエラー時のコールバック
      undefined
    );
  },
  setTexture(objName, textureName) {
    if (this.v[objName] == undefined) return;
    const obj = this.v[objName];
    if (!obj || !obj.material) {
      console.warn(`オブジェクト '${objName}' またはそのマテリアルが見つかりません。`);
      console.log(obj)
      return;
    }

    const material = obj.material;

    const newMaterialWithTexture = this.v[textureName];
    if (!newMaterialWithTexture || !(newMaterialWithTexture instanceof THREE.MeshBasicMaterial)) {
      console.warn(`テクスチャ '${textureName}' に対応する有効なマテリアルが見つかりません。`);
      return;
    }
    const texture = newMaterialWithTexture.map; // 読み込まれたテクスチャを取得

    if (material instanceof THREE.MeshBasicMaterial || material instanceof THREE.MeshStandardMaterial) {
      material.map = texture;
      material.needsUpdate = true; // マテリアルの更新をThree.jsに通知
    } else {
      console.warn(`オブジェクト '${objName}' のマテリアルはテクスチャマップをサポートしていません。`);
    }
  },
  /**
 * Canvasテクスチャを使ってテキストを表示する平面オブジェクトを追加
 * @param {string} name - オブジェクトの識別名
 * @param {string} textContent - 表示するテキスト
 * @param {number} fontSize - フォントサイズ (例: 80)
 * @param {string} textColor - テキストの色 (例: 'white', '#FF0000')
 */
  addTextPlane(name, textContent, fontSize, textColor) {
    // 内部的なデフォルト値
    const fontFamily = 'Arial'; // またはお好みの汎用フォント
    const padding = 20; // テキスト周りの余白
    const planeScale = 100; // Three.jsのワールド単位への変換スケール

    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');

    context.font = `Bold ${fontSize}px ${fontFamily}`;

    // テキストの幅を測定
    const textMetrics = context.measureText(textContent);
    const textWidth = textMetrics.width;
    const textHeight = fontSize; // おおよその高さ

    // Canvasのサイズを計算 (パディングを含む)
    canvas.width = textWidth + padding * 2;
    canvas.height = textHeight + padding * 2;

    // Canvasの描画設定を再適用 (width/height変更でリセットされるため)
    context.font = `Bold ${fontSize}px ${fontFamily}`;
    context.fillStyle = textColor;
    context.textAlign = 'center';
    context.textBaseline = 'middle';

    // テキストを描画
    context.fillText(textContent, canvas.width / 2, canvas.height / 2);

    // Canvasをテクスチャとして使用
    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;

    // マテリアルを作成 (両面表示をデフォルト)
    const material = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      side: THREE.DoubleSide, // 両面表示
    });

    // 平面ジオメトリのサイズをCanvasのアスペクト比に合わせて調整
    const planeWidth = canvas.width / planeScale;
    const planeHeight = canvas.height / planeScale;
    const planeGeometry = new THREE.PlaneGeometry(planeWidth, planeHeight);
    const textMesh = new THREE.Mesh(planeGeometry, material);

    this.v.scene.add(textMesh);
    this.v[name] = textMesh; // シーンに追加したメッシュをvに保存
  },
  /**
   * 既存のテキスト平面オブジェクトの文字内容とスタイルを更新
   * @param {string} name - 更新するオブジェクトの識別名
   * @param {string} newTextContent - 新しいテキスト内容
   * @param {number} fontSize - 新しいフォントサイズ
   * @param {string} textColor - 新しいテキストの色
   */
  setTextPlaneText(name, newTextContent, fontSize, textColor) {
    const textMesh = this.v[name];
    if (!textMesh || !textMesh.material || !textMesh.material.map || !(textMesh.material.map instanceof THREE.CanvasTexture)) {
      console.warn(`オブジェクト '${name}' は有効なテキスト平面ではありません。`);
      return;
    }

    // 内部的なデフォルト値 (addTextPlaneと合わせる)
    const fontFamily = 'Arial';
    const padding = 20;
    const planeScale = 100;

    const texture = textMesh.material.map;
    const canvas = texture.image;
    const context = canvas.getContext('2d');

    // Canvasをクリア
    context.clearRect(0, 0, canvas.width, canvas.height);

    // 新しいテキストのサイズを測定し、必要に応じてCanvasサイズとジオメトリを更新
    const textMetrics = context.measureText(newTextContent);
    const newTextWidth = textMetrics.width;
    const newTextHeight = fontSize;

    const newCanvasWidth = newTextWidth + padding * 2;
    const newCanvasHeight = newTextHeight + padding * 2;

    // Canvasのサイズが変更された場合、ジオメトリも更新する必要がある
    if (canvas.width !== newCanvasWidth || canvas.height !== newCanvasHeight) {
      canvas.width = newCanvasWidth;
      canvas.height = newCanvasHeight;
      // ジオメトリを再生成（古いジオメトリを破棄）
      if (textMesh.geometry) {
        textMesh.geometry.dispose();
      }
      const newPlaneWidth = canvas.width / planeScale;
      const newPlaneHeight = canvas.height / planeScale;
      textMesh.geometry = new THREE.PlaneGeometry(newPlaneWidth, newPlaneHeight);
    }

    // Canvasの描画設定を再適用し、テキストを描画
    // この部分をif文の外に出すことで、Canvasサイズが変わらない場合でもテキストが再描画されるようにします。
    context.font = `Bold ${fontSize}px ${fontFamily}`;
    context.fillStyle = textColor;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(newTextContent, canvas.width / 2, canvas.height / 2);

    // テクスチャの更新をThree.jsに通知
    texture.needsUpdate = true;
  },
  /**
   * Three.jsシーンからオブジェクトを削除する関数
   * @param {string} name - 削除するオブジェクトの識別名
   */
  removeObject(name) {
    const objectToRemove = this.v[name];

    if (!objectToRemove) {
      console.warn(`オブジェクト '${name}' は見つかりませんでした。`);
      return;
    }

    // シーンからオブジェクトを削除
    this.v.scene.remove(objectToRemove);

    // ジオメトリとマテリアルを破棄してメモリを解放
    if (objectToRemove.geometry) {
      objectToRemove.geometry.dispose();
    }
    if (objectToRemove.material) {
      // マテリアルが配列の場合を考慮
      if (Array.isArray(objectToRemove.material)) {
        objectToRemove.material.forEach(material => material.dispose());
      } else {
        objectToRemove.material.dispose();
      }
    }

    // this.v からも参照を削除
    delete this.v[name];
    console.log(`オブジェクト '${name}' がシーンから削除されました。`);
  },
  setSize() {
    let v = this.v;
    v["camera"] = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    v["camera"].position.z = 5;
    v["renderer"].setSize(window.innerWidth, window.innerHeight);
  },
  handleEventInit() {
    this.handleEvent("addCube", data => {
      this.addCube(data.name, data.x, data.y, data.z, data.color)
    });

    this.handleEvent("addPlane", data => {
      this.addPlane(data.name, data.x, data.y, data.color)
    });

    this.handleEvent("rotation", data => {
      this.rotation(data.name, data.x, data.y, data.z)
    });

    this.handleEvent("position", data => {
      this.position(data.name, data.x, data.y, data.z)
    });

    this.handleEvent("loadModel", data => {
      this.loadModel(data.name, data.path)
    });

    this.handleEvent("getBone", data => {
      this.getBone(data.name)
    });
    this.handleEvent("setBlendShape", data => {
      this.setBlendShape(data.name, data.key, data.value)
    });
    this.handleEvent("rotationBone", data => {
      this.rotationBone(data.name, data.bone_name, data.x, data.y, data.z)
    });

    this.handleEvent("loadTexture", data => {
      this.loadTexture(data.name, data.path)
    });

    this.handleEvent("setTexture", data => {
      this.setTexture(data.obj_name, data.texture_name)
    });

    this.handleEvent("addTextPlane", data => {
      this.addTextPlane(data.name, data.textContent, data.fontSize, data.textColor);
    });

    this.handleEvent("setTextPlaneText", data => {
      this.setTextPlaneText(data.name, data.newTextContent, data.fontSize, data.textColor);
    });
    this.handleEvent("removeObject", data => {
      this.removeObject(data.name);
    });
    this.handleEvent("setSize", () => {
      this.setSize();
    });
  },
  init(el) {
    // シーンの作成
    let v = this.v;
    const scene = new THREE.Scene();

    // 環境光の追加 (シーン全体を均一に照らす)
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.0); // 色と強度
    scene.add(ambientLight);

    // 平行光源の追加 (太陽のように特定方向から照らす)
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1.5); // 色と強度
    directionalLight.position.set(0, 10, 5); // 光源の位置
    scene.add(directionalLight);

    // カメラの作成
    v["camera"] = new THREE.PerspectiveCamera(75, 1000 / 800, 0.1, 1000);
    v["camera"].position.z = 5;

    // レンダラーの作成
    v["renderer"] = new THREE.WebGLRenderer();
    v["renderer"].setSize(1000, 800);
    el.appendChild(v["renderer"].domElement);

    function render() {
      requestAnimationFrame(render);
      v["renderer"].render(scene, v["camera"]);
    }

    render();
    v["scene"] = scene;
  }
}

export default Threejs
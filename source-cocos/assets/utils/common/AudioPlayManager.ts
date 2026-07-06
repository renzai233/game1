import { AudioSource, AudioClip, Node, input, Input } from 'cc';
import { loadResSingleAsset } from '../utils';
import { Singleton } from './Singleton';

interface AudioEffectNode {
    node: Node;
    audio: AudioSource;
    inUse: boolean;
    loop: boolean;
}

// AudioPlayManager.ts
export class AudioPlayManager extends Singleton {

    private _musicOn: boolean = true;
    private _effectOn: boolean = true;
    private _musicAudio: AudioSource | null = null;
    private _effectRoot: Node | null = null;
    private _musicVolume: number = 1;
    private _effectVolume: number = 1;
    private _curMusicPath: string = '';
    private _musicUnlockRetryRegistered: boolean = false;
    private readonly _musicUnlockRetryHandler = () => this._retryMusicAfterUserGesture();

    private _effectNodes: AudioEffectNode[] = [];
    private _loopingEffects: Map<string, AudioEffectNode> = new Map();
    private _maxPoolSize: number = 10;
    private _initialPoolSize: number = 5;

    private _ensureEffectRoot(): Node | null {
        if (this._effectRoot && this._effectRoot.isValid) {
            return this._effectRoot;
        }

        if (!this._musicAudio || !this._musicAudio.isValid || !this._musicAudio.node || !this._musicAudio.node.isValid) {
            console.error('[AudioPlayManager] 未初始化或音频节点无效，请先调用 APM.init()');
            this._effectRoot = null;
            return null;
        }

        const musicNode = this._musicAudio.node;
        let root = musicNode.getChildByName('EffectAudioRoot');
        if (!root) {
            root = new Node('EffectAudioRoot');
            musicNode.addChild(root);
        }
        this._effectRoot = root;
        return root;
    }

    private _isEffectNodeValid(effectNode: AudioEffectNode | null | undefined): boolean {
        if (!effectNode) return false;
        if (!effectNode.node || !effectNode.node.isValid) return false;
        if (!effectNode.audio || !effectNode.audio.isValid) return false;
        if (!effectNode.audio.node || !effectNode.audio.node.isValid) return false;
        return true;
    }

    private _cleanupInvalidEffectNodes(): void {
        if (this._effectNodes.length) {
            this._effectNodes = this._effectNodes.filter((effectNode) => this._isEffectNodeValid(effectNode));
        }

        if (this._loopingEffects.size) {
            for (const [path, effectNode] of this._loopingEffects) {
                if (!this._isEffectNodeValid(effectNode)) {
                    this._loopingEffects.delete(path);
                }
            }
        }
    }

    /**
     * 初始化，传入场景中挂载AudioSource的节点
     */
    public init(musicAudio: AudioSource) {
        if (this.hasMusicAudio()) return; // 已初始化且音频节点有效则跳过
        this._musicAudio = musicAudio;
        this._effectRoot = null;
        this._effectNodes = [];
        this._loopingEffects.clear();
        this._curMusicPath = '';
        // 读取本地设置
        this._musicOn = localStorage.getItem('setting_music') !== '0';
        this._effectOn = localStorage.getItem('setting_effect') !== '0';
        this.setMusicOn(this._musicOn);
        this.setEffectOn(this._effectOn);
        // 初始化音效对象池
        this._initEffectPool();
    }

    /**
     * 判断是否已存在有效的背景音乐播放组件
     */
    public hasMusicAudio(): boolean {
        return this._musicAudio !== null && this._musicAudio.isValid && this._musicAudio.node && this._musicAudio.node.isValid;
    }

    /**
     * 初始化音效对象池
     */
    private _initEffectPool(): void {
        for (let i = 0; i < this._initialPoolSize; i++) {
            const effectNode = this._createEffectNode();
            if (!effectNode) {
                break;
            }
            this._effectNodes.push(effectNode);
        }
    }

    /**
     * 创建音效节点
     */
    private _createEffectNode(): AudioEffectNode | null {
        const node = new Node('EffectAudio');
        const audio = node.addComponent(AudioSource);
        const root = this._ensureEffectRoot();
        if (!root) {
            node.destroy();
            return null;
        }
        root.addChild(node);
        return { node, audio, inUse: false, loop: false };
    }

    /**
     * 从对象池获取音效节点
     */
    private _getEffectNode(): AudioEffectNode | null {
        this._cleanupInvalidEffectNodes();
        // 查找空闲节点
        let effectNode = this._effectNodes.find(n => !n.inUse);
        
        if (!effectNode && this._effectNodes.length < this._maxPoolSize) {
            // 对象池未满，创建新节点
            effectNode = this._createEffectNode();
            if (effectNode) {
                this._effectNodes.push(effectNode);
            }
        }
        
        return effectNode || null;
    }

    /**
     * 释放音效节点回对象池
     */
    private _releaseEffectNode(effectNode: AudioEffectNode): void {
        if (effectNode.loop) {
            // 循环音效特殊处理
            effectNode.audio.stop();
            effectNode.inUse = false;
        } else {
            effectNode.inUse = false;
        }
    }

    /**
     * 播放背景音乐
     * @param path resources下的路径，如'music/bgm'
     * @param loop 是否循环
     */
    public playMusic(path?: string, loop: boolean = true) {
        if (!this._musicAudio) return;
        if (this._curMusicPath === path && this._musicAudio.playing) return;
        if (!path) path = 'audio/bgm/home';

        // 显式停止当前正在播放的声音并清空，防止多轨重叠播放
        this._musicAudio.stop();
        this._musicAudio.clip = null;

        loadResSingleAsset(path, (clip: AudioClip) => {
            if (!this._musicAudio || !this._musicAudio.isValid) return;
            if (!clip) {
                console.warn('[AudioPlayManager] 背景音乐资源加载失败:', path);
                return;
            }
            this._musicAudio.clip = clip;
            this._musicAudio.loop = loop;
            this._musicAudio.volume = this._musicOn ? this._musicVolume : 0;
            this._curMusicPath = path;
            this._tryPlayMusic();
        }, AudioClip);
    }

    /**
     * 尝试播放背景音乐。Web 端可能因自动播放策略失败，失败后等待首次用户输入再重试。
     */
    private _tryPlayMusic(): void {
        if (!this._musicOn || !this._musicAudio || !this._musicAudio.isValid || !this._musicAudio.clip) return;

        this._musicAudio.volume = this._musicVolume;
        try {
            this._musicAudio.play();
        } catch (err) {
            console.warn('[AudioPlayManager] 背景音乐播放被拦截，等待用户交互后重试:', err);
        }

        if (!this._musicAudio.playing) {
            this._registerMusicUnlockRetry();
        }
    }

    private _registerMusicUnlockRetry(): void {
        if (this._musicUnlockRetryRegistered) return;
        this._musicUnlockRetryRegistered = true;
        input.once(Input.EventType.TOUCH_START, this._musicUnlockRetryHandler);
        input.once(Input.EventType.MOUSE_DOWN, this._musicUnlockRetryHandler);
        input.once(Input.EventType.KEY_DOWN, this._musicUnlockRetryHandler);
    }

    private _retryMusicAfterUserGesture(): void {
        if (!this._musicUnlockRetryRegistered) return;
        this._musicUnlockRetryRegistered = false;
        input.off(Input.EventType.TOUCH_START, this._musicUnlockRetryHandler);
        input.off(Input.EventType.MOUSE_DOWN, this._musicUnlockRetryHandler);
        input.off(Input.EventType.KEY_DOWN, this._musicUnlockRetryHandler);
        this._tryPlayMusic();
    }

    /**
     * 停止背景音乐
     */
    public stopMusic() {
        if (this._musicAudio) {
            this._musicAudio.stop();
        }
    }

    /**
     * 设置音乐开关
     */
    public setMusicOn(on: boolean) {
        this._musicOn = on;
        localStorage.setItem('setting_music', on ? '1' : '0');
        if (this._musicAudio) {
            this._musicAudio.volume = on ? this._musicVolume : 0;
            if (on && this._musicAudio.clip && !this._musicAudio.playing) {
                this._tryPlayMusic();
            }
            if (!on && this._musicAudio.playing) {
                this._musicAudio.stop();
            }
        }
    }

    /**
     * 设置音乐音量
     */
    public setMusicVolume(volume: number) {
        this._musicVolume = volume;
        if (this._musicAudio && this._musicOn) {
            this._musicAudio.volume = volume;
        }
    }

    /**
     * 设置音效开关
     */
    public setEffectOn(on: boolean) {
        this._effectOn = on;
        localStorage.setItem('setting_effect', on ? '1' : '0');
        if (!on) {
            this.stopAllEffects();
        }
    }

    /**
     * 设置音效音量
     */
    public setEffectVolume(volume: number) {
        this._effectVolume = volume;
        // 更新所有正在播放的音效音量
        this._effectNodes.forEach(effectNode => {
            if (this._isEffectNodeValid(effectNode) && effectNode.inUse && effectNode.audio.playing) {
                effectNode.audio.volume = volume;
            }
        });
    }

    /**
     * 播放音效
     * @param path resources下的路径，如'sound/click'
     * @param loop 是否循环
     */
    public playEffect(path: string, loop: boolean = false) {
        if (!this._effectOn) return;
        if (!this._ensureEffectRoot()) return;

        // 如果是循环音效且已经在播放，先停止
        if (loop && this._loopingEffects.has(path)) {
            const existingEffect = this._loopingEffects.get(path);
            if (existingEffect) {
                if (!this._isEffectNodeValid(existingEffect)) {
                    this._loopingEffects.delete(path);
                } else if (existingEffect.audio.playing) {
                    return;
                }
            }
        }

        loadResSingleAsset(path, (clip: AudioClip) => {
            if (!clip) return;

            const effectNode = this._getEffectNode();
            if (!effectNode || !this._isEffectNodeValid(effectNode)) {
                console.warn('[AudioPlayManager] 音效对象池已满，无法播放音效:', path);
                return;
            }

            effectNode.node.active = true;
            effectNode.audio.clip = clip;
            effectNode.audio.loop = loop;
            effectNode.audio.volume = this._effectVolume;
            effectNode.loop = loop;
            effectNode.inUse = true;
            effectNode.audio.play();

            // 循环音效记录
            if (loop) {
                this._loopingEffects.set(path, effectNode);
            } else {
                // 非循环音效，播放完成后释放
                effectNode.audio.node.once(AudioSource.EventType.ENDED, () => {
                    this._releaseEffectNode(effectNode);
                });
            }
        }, AudioClip);
    }

    /**
     * 停止指定路径的音效
     * @param path 音效路径
     */
    public stopEffect(path: string): void {
        const loopingEffect = this._loopingEffects.get(path);
        if (loopingEffect) {
            if (this._isEffectNodeValid(loopingEffect)) {
                loopingEffect.audio.stop();
                this._releaseEffectNode(loopingEffect);
            }
            this._loopingEffects.delete(path);
        }
    }

    /**
     * 停止所有音效
     */
    public stopAllEffects() {
        // 停止所有循环音效
        this._loopingEffects.forEach((effectNode, path) => {
            if (this._isEffectNodeValid(effectNode)) {
                effectNode.audio.stop();
                this._releaseEffectNode(effectNode);
            }
        });
        this._loopingEffects.clear();

        // 停止所有正在播放的音效
        this._effectNodes.forEach(effectNode => {
            if (this._isEffectNodeValid(effectNode) && effectNode.inUse && effectNode.audio.playing) {
                effectNode.audio.stop();
                this._releaseEffectNode(effectNode);
            }
        });
    }

    /**
     * 获取音效对象池状态（用于调试）
     */
    public getPoolStatus(): { total: number, inUse: number, available: number } {
        const inUse = this._effectNodes.filter(n => n.inUse).length;
        return {
            total: this._effectNodes.length,
            inUse: inUse,
            available: this._effectNodes.length - inUse
        };
    }

    /**
     * 清理音效对象池（切换场景时调用）
     */
    public clearEffectPool(): void {
        this.stopAllEffects();
        this._effectNodes.forEach(effectNode => {
            if (this._isEffectNodeValid(effectNode)) {
                effectNode.node.destroy();
            }
        });
        this._effectNodes = [];
        this._loopingEffects.clear();
    }
}

export const APM = AudioPlayManager.instance();

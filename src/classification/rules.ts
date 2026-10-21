export interface ClassificationRule {
  name: string;
  synonyms: string[];
  pattern: RegExp;
  method?: boolean;
}

export interface ClassificationGroup extends ClassificationRule {
  task: boolean;
  focusPattern?: RegExp;
  color: [string, string, string];
  children: ClassificationRule[];
}

// These are topic phrases, not paper-title lookups. A match is a reviewable hint.
export const CLASSIFICATION_GROUPS: ClassificationGroup[] = [
  {
    name: 'Locomotion', synonyms: ['Legged Robot Locomotion', 'Locomotion', '足式机器人运动'],
    pattern: /\b(?:locomotion|legged|quadruped(?:al)?|bipedal|parkour|standing[- ]up|getting[- ]up|get up|walking|running|learning to walk|gait|motor adaptation|terrain adaptation)\b|足式|四足|双足|跑酷|起身|步态/i,
    focusPattern: /\b(?:locomotion|parkour|standing[- ]up|get(?:ting)?[- ]up|walking|running|learning to walk|motor adaptation|terrain adaptation)\b|运动控制|跑酷|起身|行走/i,
    task: true, color: ['#e7f5ff', '#1971c2', '#74c0fc'],
    children: [
      { name: 'Parkour', synonyms: ['Parkour'], pattern: /\bparkour\b|跑酷/i },
      { name: 'Jumping', synonyms: [], pattern: /\b(?:jumping|leaping)\b|跳跃/i },
      { name: 'Recovery', synonyms: ['Standing-up'], pattern: /\b(?:standing[- ]up|stand[- ]up|get(?:ting)?[- ]up|fall recovery|self[- ]righting)\b|起身|跌倒恢复/i },
      { name: 'Proprioception', synonyms: ['Proprioceptive Locomotion'], pattern: /\b(?:proprioceptive|blind locomotion)\b|本体感知|盲走/i, method: true },
      { name: 'Robust Control', synonyms: ['Robust'], pattern: /\brobust\b|鲁棒/i },
      { name: 'System ID', synonyms: ['System Identification'], pattern: /\bsystem identification\b|系统辨识/i, method: true },
      { name: 'Model-based Control', synonyms: ['Model Based'], pattern: /\b(?:model-based|model based (?:control|planning|reinforcement learning|policy))\b|基于模型的控制|模型控制/i, method: true },
      { name: 'Privileged Estimation', synonyms: ['Privilege Etimation'], pattern: /\bprivileg(?:ed|e) (?:state )?(?:estimation|estimator|etimation)\b|特权状态估计|特权信息估计/i, method: true },
      { name: 'Terrain Adaptation', synonyms: ['Perception-driven control'], pattern: /\b(?:perceptive|vision[- ]based|visual|terrain|perception[- ]driven)\b|视觉|地形|感知驱动/i },
    ],
  },
  {
    name: 'Whole-body Motion', synonyms: ['Mimic', 'Whole-body Tracking', 'Whole-body Control'],
    pattern: /\b(?:whole[- ]body|humanoid control|motion track(?:ing|er)|track(?:ing)? (?:any |various |diverse )?motions?|motion imitation|motion retargeting|human motion|motion priors?|motion foundation models?)\b|全身运动|全身控制|运动跟踪|运动追踪|动作模仿|动作重定向|运动先验/i,
    focusPattern: /\b(?:whole[- ]body|humanoid control|motion track(?:ing|er)|track(?:ing)? (?:any |various |diverse )?motions?|motion imitation|motion retargeting|human motion)\b|全身|运动跟踪|运动追踪|重定向/i,
    task: true, color: ['#f3f0ff', '#6741d9', '#b197fc'],
    children: [
      { name: 'Motion Tracking', synonyms: ['Motion Tracking'], pattern: /\b(?:motion track(?:ing|er)|whole[- ]body tracking|track(?:ing)? (?:any |various |diverse |human )?motions?)\b|运动跟踪|运动追踪|全身跟踪/i },
      { name: 'Motion Imitation', synonyms: [], pattern: /\bmotion imitation\b|动作模仿|运动模仿/i },
      { name: 'Dynamic Retarget', synonyms: ['Dynamic Retarget'], pattern: /\b(?:dynamic|kinodynamic|dynamics[- ]aware|dynamically feasible) (?:motion )?retarget(?:ing)?\b|动力学重定向/i, method: true },
      { name: 'Kinematic Retarget', synonyms: ['Kinematic Retarget'], pattern: /\bkinematic (?:motion )?retarget(?:ing)?\b|运动学重定向/i, method: true },
      { name: 'Retargeting', synonyms: ['Retargeting'], pattern: /\b(?:retargeting|retarget)\b|重定向/i },
      { name: 'AMP', synonyms: ['AMP'], pattern: /\b(?:adversarial motion priors?|amp)\b|对抗运动先验/i, method: true },
      { name: 'Motion Inpainting', synonyms: [], pattern: /\bmotion inpainting\b|运动补全|动作补全/i, method: true },
      { name: 'Motion Prior', synonyms: ['Motion Priors'], pattern: /\bmotion priors?\b|运动先验/i },
      { name: 'Skill Models', synonyms: ['Action', 'Skill Foundation Model'], pattern: /\b(?:foundation model|generalist|universal policy|skill repertoire|multi[- ]skill)\b|基础模型|通用策略|多技能/i },
    ],
  },
  {
    name: 'Manipulation', synonyms: ['Loco-Manipulation', 'Manipulation', 'Mobile Manipulation'],
    pattern: /\b(?:manipulation|loco[- ]manipulation|grasping|dexterous|end[- ]effector)\b|移动操作|灵巧操作|抓取|机械臂|末端跟踪/i,
    focusPattern: /\b(?:manipulation|loco[- ]manipulation|grasping|in[- ]hand|end[- ]effector)\b|移动操作|灵巧操作|抓取|机械臂|末端跟踪/i,
    task: true, color: ['#fff4e6', '#d9480f', '#ffa94d'],
    children: [
      { name: 'Mobile Manipulation', synonyms: ['Loco Manipulation'], pattern: /\b(?:mobile manipulation|loco[- ]manipulation|locomotion and manipulation|manipulation and locomotion)\b|移动操作|行走操作/i },
      { name: 'Dexterous Control', synonyms: ['Dexterous Manipulation'], pattern: /\b(?:dexterous manipulation|dexterous in[- ]hand|in[- ]hand|grasping)\b|灵巧操作|手内|抓取/i },
      { name: 'End-effector Tracking', synonyms: ['End-effector Tracking'], pattern: /\bend[- ]effector\b|末端跟踪|末端执行器/i },
    ],
  },
  {
    name: 'Perception', synonyms: ['Perception', 'State Estimation and Mapping'],
    pattern: /\b(?:elevation map(?:ping|s)?|height ?map(?:s)?|mapping|slam|odometry|state estimation|terrain reconstruction|depth estimation)\b|高程图|高度图|建图|状态估计|里程计|地形重建|深度估计/i,
    focusPattern: /\b(?:elevation map(?:ping|s)?|height ?map(?:s)?|mapping|slam|odometry|state estimation|terrain reconstruction|depth estimation)\b|高程图|建图|状态估计|地形重建|深度估计/i,
    task: true, color: ['#e6fcf5', '#087f5b', '#63e6be'],
    children: [
      { name: 'Heightmap', synonyms: ['elevation map'], pattern: /\b(?:elevation map(?:ping|s)?|height ?map(?:s)?)\b|高程图|高度图/i, method: true },
      { name: 'Terrain Mapping', synonyms: ['Terrain Reconstruction'], pattern: /\bterrain reconstruction\b|地形重建/i },
      { name: 'SLAM', synonyms: ['SLAM'], pattern: /\bslam\b|同步定位与建图/i, method: true },
      { name: 'Mapping', synonyms: [], pattern: /\bmapping\b|建图/i },
      { name: 'Odometry', synonyms: [], pattern: /\bodometry\b|里程计/i, method: true },
      { name: 'State Estimation', synonyms: ['State Estimation'], pattern: /\b(?:state estimation|state estimator|velocity estimation)\b|状态估计|速度估计/i, method: true },
      { name: 'Depth', synonyms: ['depth camera'], pattern: /\b(?:depth (?:images?|maps?|camera|input)|depth[- ]based)\b|深度图|深度相机/i, method: true },
      { name: 'RGB', synonyms: ['RGB camera'], pattern: /\brgb(?:[- ](?:images?|camera|vision|input))?\b|彩色相机|彩色图像/i, method: true },
      { name: 'LiDAR', synonyms: [], pattern: /\blidar\b|激光雷达/i, method: true },
      { name: 'Voxel Map', synonyms: ['Voxel Map'], pattern: /\b(?:voxel|voxelized|voxelised)\b|体素/i, method: true },
      { name: 'Depth Estimation', synonyms: ['Depth Estimation'], pattern: /\bdepth estimation\b|深度估计/i, method: true },
    ],
  },
  {
    name: 'Learning Methods', synonyms: ['Algorithm', 'Attention', 'Reinforcement Learning', 'RL', '机器学习'],
    pattern: /\b(?:reinforcement learning|policy optimi[sz]ation|generali[sz]ed advantage estimation|actor[- ]critic|attention|transformers?|imitation learning|adversarial learning|adversarial networks?|ppo|gae|dagger|gan|gail|moe|multimodal|multi[- ]modal|cross[- ]modality|vision[- ](?:and[- ])?language|visual[- ]linguistic|diffusion models?|mixture[- ]of[- ]experts|teacher[- ]student|distillation|behavio[u]?r cloning)\b|强化学习|策略优化|注意力|模仿学习|对抗学习|多模态|扩散模型|混合专家|蒸馏|行为克隆/i,
    task: false, color: ['#fff0f6', '#a61e4d', '#faa2c1'],
    children: [
      { name: 'PPO', synonyms: ['Proximal Policy Optimization'], pattern: /\b(?:ppo|proximal policy optimi[sz]ation)\b|近端策略优化/i, method: true },
      { name: 'TRPO', synonyms: [], pattern: /\b(?:trpo|trust region policy optimi[sz]ation)\b|信赖域策略优化/i, method: true },
      { name: 'GAE', synonyms: ['GAE'], pattern: /\b(?:gae|generali[sz]ed advantage estimation)\b|广义优势估计/i, method: true },
      { name: 'Multi Critic', synonyms: ['MultiCritic'], pattern: /\b(?:multi[- ]?critic|multiple critics)\b|多评论家|多价值网络/i, method: true },
      { name: 'Distillation', synonyms: ['Teacher-Student'], pattern: /\b(?:teacher[- ]student|distillation)\b|教师[—－-]?学生|策略蒸馏|知识蒸馏/i, method: true },
      { name: 'DAgger', synonyms: ['Dataset Aggregation'], pattern: /\b(?:dagger|dataset aggregation)\b|数据集聚合/i, method: true },
      { name: 'Behavior Cloning', synonyms: ['Behavior Cloning'], pattern: /\bbehavio[u]?r(?:al)? cloning\b|行为克隆/i, method: true },
      { name: 'Self Attention', synonyms: ['Self Attention'], pattern: /\bself[- ]attention\b|自注意力/i, method: true },
      { name: 'Cross Attention', synonyms: ['Cross Attention'], pattern: /\bcross[- ]attention\b|交叉注意力/i, method: true },
      { name: 'Attention', synonyms: [], pattern: /\battention\b|注意力/i, method: true },
      { name: 'Transformer', synonyms: [], pattern: /\btransformers?\b/i, method: true },
      { name: 'Multimodal', synonyms: ['Multimodal'], pattern: /\b(?:multi[- ]modal|cross[- ]modal(?:ity)?|vision[- ](?:and[- ])?language|visual[- ]linguistic|image[- ]text|vision and language)\b|多模态|跨模态|视觉语言|视觉和语言/i, method: true },
      { name: 'GAN', synonyms: ['GAN'], pattern: /\b(?:gan|generative adversarial networks?)\b|生成对抗网络/i, method: true },
      { name: 'GAIL', synonyms: [], pattern: /\b(?:generative adversarial imitation learning|gail)\b|生成对抗模仿学习/i, method: true },
      { name: 'Adversarial Imitation', synonyms: ['Adversarial Imitation Learning'], pattern: /\badversarial imitation(?: learning)?\b|对抗模仿学习/i, method: true },
      { name: 'Diffusion', synonyms: ['Diffusion Model'], pattern: /\bdiffusion (?:models?|polic(?:y|ies))\b|扩散模型|扩散策略/i, method: true },
      { name: 'MoE', synonyms: ['Mixture of Experts', 'MoE'], pattern: /\b(?:mixture[- ]of[- ]experts|moe)\b|混合专家/i, method: true },
      { name: 'VAE', synonyms: [], pattern: /\b(?:vae|variational autoencoder)\b|变分自编码器/i, method: true },
    ],
  },
  {
    name: 'Robot Tools', synonyms: ['Robotic Infra', 'Robotics Infrastructure'],
    pattern: /\b(?:rotation representations?|rotation representation|robot(?:ic)? simulator|robot(?:ics)? benchmark|robot(?:ic)? dataset|simulation framework|robot(?:ics)? infrastructure)\b|旋转表示|机器人仿真|机器人数据集|机器人基础设施/i,
    task: false, color: ['#f1f3f5', '#343a40', '#adb5bd'],
    children: [
      { name: 'Representations', synonyms: ['Representations and Tools'], pattern: /\b(?:rotation representations?|simulator|simulation framework|toolkit)\b|旋转表示|仿真器|工具包/i },
      { name: 'Datasets', synonyms: ['Datasets and Benchmarks'], pattern: /\b(?:dataset|benchmark)\b|数据集|评测|基准/i },
    ],
  },
  {
    name: 'Vision', synonyms: ['Computer Vision'],
    pattern: /\b(?:image generation|image synthesis|image inpainting|visual representation|image recognition|object detection|semantic segmentation|computer vision)\b|图像生成|图像合成|图像修复|视觉表征|图像识别|目标检测|语义分割|计算机视觉/i,
    task: true, color: ['#fff9db', '#5c4813', '#fcc419'],
    children: [
      { name: 'Image Generation', synonyms: ['Image Generation'], pattern: /\b(?:image generation|image synthesis|text[- ]to[- ]image)\b|图像生成|图像合成|文生图/i },
      { name: 'Inpainting', synonyms: [], pattern: /\bimage inpainting\b|图像修复/i, method: true },
      { name: 'Visual Features', synonyms: ['Visual Representation'], pattern: /\b(?:visual representation|image recognition|object detection|semantic segmentation)\b|视觉表征|图像识别|目标检测|语义分割/i },
    ],
  },
];

export function topicKey(value: string): string {
  return value.trim().toLowerCase().replace(/[-_\s]+/g, ' ');
}

export function matchesTopic(name: string, rule: ClassificationRule): boolean {
  const key = topicKey(name);
  return [rule.name, ...rule.synonyms].some(candidate => topicKey(candidate) === key);
}

export function groupForName(name: string): ClassificationGroup | undefined {
  return CLASSIFICATION_GROUPS.find(group => matchesTopic(name, group)
    || group.children.some(child => matchesTopic(name, child)));
}

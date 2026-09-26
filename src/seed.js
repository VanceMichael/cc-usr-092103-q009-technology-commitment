// 样例数据：全部为虚构主体与虚构材料，用于演示和本地测试，不含真实信息。
// 覆盖：半导体（资源投入→验证中）、生物电子（版本替代）、金融服务（资料未齐/仅名片）、
// 软件研发（已形成订单）、以及一个签约后撤回的项目。
import { STAGES } from './catalog.js';
import { intentContentHash } from './hashing.js';

export function buildSeedState() {
  const parties = [
    { id: 'p-spec', name: '京台科技项目专员办', role: 'specialist' },

    { id: 'p-t-jingyuan', name: '晶缘半导体（台湾）', role: 'taiwan_enterprise' },
    { id: 'p-r-s3gen', name: '北京第三代半导体研究院', role: 'beijing_research' },
    { id: 'p-n-huachi', name: '华驰新能源汽车（北京）', role: 'scene_owner' },

    { id: 'p-t-hesheng', name: '合生医电股份（台湾）', role: 'taiwan_enterprise' },
    { id: 'p-r-bmepku', name: '北京大学医工交叉实验室', role: 'beijing_research' },
    { id: 'p-n-jingbei', name: '京北康复医院', role: 'scene_owner' },

    { id: 'p-t-xintong', name: '信通安联科技（台湾）', role: 'taiwan_enterprise' },
    { id: 'p-r-fintechlab', name: '北京清汇金融科技实验室', role: 'beijing_research' },
    { id: 'p-n-jingcheng', name: '京城银行普惠金融部', role: 'scene_owner' },

    { id: 'p-t-yunzao', name: '云造工业软件（台湾）', role: 'taiwan_enterprise' },
    { id: 'p-r-riise', name: '北京软件科学研究所', role: 'beijing_research' },
    { id: 'p-n-jingxi', name: '京西智造工厂', role: 'scene_owner' },

    { id: 'p-t-anxin', name: '安鑫数科（台湾）', role: 'taiwan_enterprise' },
    { id: 'p-n-beifang', name: '北方消费金融', role: 'scene_owner' }
  ];

  const capabilities = [
    { id: 'cap-jy-01', ownerPartyId: 'p-t-jingyuan', category: 'semiconductor', title: '车规级 SiC 功率模块封装设计', detail: '1200V/600A 模块结构设计与可靠性验证能力，已通过 AEC-Q101 类试验（自述）。' },
    { id: 'cap-hs-01', ownerPartyId: 'p-t-hesheng', category: 'bioelectronics', title: '柔性电子皮肤传感阵列', detail: '柔性多通道生理信号采集前端，可用于康复评估。' },
    { id: 'cap-xt-01', ownerPartyId: 'p-t-xintong', category: 'finance', title: '小微授信风控模型引擎', detail: '替代数据评分与合规留痕，支持本地化部署。' },
    { id: 'cap-yz-01', ownerPartyId: 'p-t-yunzao', category: 'software', title: '离散制造 MES 与排程平台', detail: '多工厂排产、质量追溯与设备联网，SaaS 与私有部署双形态。' },
    { id: 'cap-ax-01', ownerPartyId: 'p-t-anxin', category: 'finance', title: '消费金融贷后催收策略系统', detail: '分案策略、语音质检与合规录音留存。' }
  ];

  const researchResources = [
    { id: 'res-s3-01', ownerPartyId: 'p-r-s3gen', category: 'semiconductor', title: '六英寸 SiC 中试验证线', detail: '可提供模块封装打样、温度循环与功率循环测试机时。' },
    { id: 'res-bme-01', ownerPartyId: 'p-r-bmepku', category: 'bioelectronics', title: '柔性器件工艺平台与伦理备案临床通道', detail: '柔性电路印刷工艺、皮肤贴合测试，及合作医院伦理审批通道。' },
    { id: 'res-ft-01', ownerPartyId: 'p-r-fintechlab', category: 'finance', title: '金融模型沙箱与脱敏数据集', detail: '联邦学习沙箱、小微企业脱敏信贷样本。' },
    { id: 'res-ri-01', ownerPartyId: 'p-r-riise', category: 'software', title: '工业软件适配验证中心', detail: '国产操作系统/数据库适配环境、信创栈性能基准。' }
  ];

  const scenarioNeeds = [
    { id: 'need-hc-01', ownerPartyId: 'p-n-huachi', category: 'semiconductor', title: '电驱控制器 SiC 模块国产替代', detail: '年产 30 万套电驱的模块导入需求，要求 -40~175℃ 可靠性与二供产能。' },
    { id: 'need-jb-01', ownerPartyId: 'p-n-jingbei', category: 'bioelectronics', title: '康复训练量化评估', detail: '住院康复患者关节活动与肌力评估，需对接院内 HIS，数据不出院。' },
    { id: 'need-jc-01', ownerPartyId: 'p-n-jingcheng', category: 'finance', title: '普惠小微线上风控', detail: '针对无抵押小微商户的全自动授信，要求可解释性与监管报送。' },
    { id: 'need-jx-01', ownerPartyId: 'p-n-jingxi', category: 'software', title: '多车间 MES 统一排产', detail: '5 个车间 260 台设备联网，交付周期与在制品透明度考核。' },
    { id: 'need-bf-01', ownerPartyId: 'p-n-beifang', category: 'finance', title: '贷后合规降本', detail: '催收分案与质检覆盖率 100%，投诉率下降目标。' }
  ];

  const materials = [
    { id: 'mat-semi-dd-01', intentId: 'intent-semi', ownerPartyId: 'p-t-jingyuan', name: 'SiC 模块工艺参数包 v3', level: 'secret', visibleToPartyIds: ['p-t-jingyuan', 'p-r-s3gen', 'p-n-huachi'], ref: 'DD-SEMI-001', at: '2026-03-18' },
    { id: 'mat-semi-dd-02', intentId: 'intent-semi', ownerPartyId: 'p-t-jingyuan', name: '驻场人员保密协议（三方）', level: 'normal', visibleToPartyIds: [], ref: 'NDA-SEMI-014', at: '2026-03-20' },

    { id: 'mat-bio-dd-01', intentId: 'intent-bio-v2', ownerPartyId: 'p-t-hesheng', name: '电子皮肤临床受试者数据样本', level: 'secret', visibleToPartyIds: ['p-t-hesheng', 'p-r-bmepku', 'p-n-jingbei'], ref: 'DD-BIO-007', at: '2026-05-22' },
    { id: 'mat-bio-dd-02', intentId: 'intent-bio-v2', ownerPartyId: 'p-n-jingbei', name: '伦理审查批件', level: 'normal', visibleToPartyIds: [], ref: 'IRB-JB-2026-11', at: '2026-05-30' },

    { id: 'mat-fin-dd-01', intentId: 'intent-fin', ownerPartyId: 'p-t-xintong', name: '模型等保三级测评报告', level: 'normal', visibleToPartyIds: [], ref: 'MLPS-FT-302', at: '2026-07-08' },
    // 场景方尽调（数据接入安全评估）尚未上传 → 意向资料不完整，不能进入执行

    { id: 'mat-sw-dd-01', intentId: 'intent-sw', ownerPartyId: 'p-t-yunzao', name: 'MES 源代码托管凭证', level: 'secret', visibleToPartyIds: ['p-t-yunzao', 'p-r-riise', 'p-n-jingxi'], ref: 'DD-SW-003', at: '2026-01-15' },
    { id: 'mat-sw-dd-02', intentId: 'intent-sw', ownerPartyId: 'p-r-riise', name: '信创适配测试报告', level: 'normal', visibleToPartyIds: [], ref: 'ADAPT-RI-208', at: '2026-02-02' },

    { id: 'mat-fin2-dd-01', intentId: 'intent-fin2', ownerPartyId: 'p-t-anxin', name: '催收策略规则手册', level: 'normal', visibleToPartyIds: [], ref: 'DD-AX-011', at: '2026-04-10' }
  ];

  const intents = [
    {
      id: 'intent-semi', projectKey: 'semi-sic-huachi', category: 'semiconductor',
      title: '车规 SiC 功率模块联合中试与导入', version: 1, status: 'active',
      participantPartyIds: ['p-t-jingyuan', 'p-r-s3gen', 'p-n-huachi'],
      links: { capabilityIds: ['cap-jy-01'], resourceIds: ['res-s3-01'], needIds: ['need-hc-01'] },
      ddRequired: [
        { id: 'ddr-1', title: '台企工艺参数包', ownerPartyId: 'p-t-jingyuan', materialId: 'mat-semi-dd-01' },
        { id: 'ddr-2', title: '三方保密协议', ownerPartyId: 'p-t-jingyuan', materialId: 'mat-semi-dd-02' }
      ],
      commitments: [
        { id: 'cmt-1', partyId: 'p-r-s3gen', text: '投入中试线 120 机时并指派两名工艺工程师（适用于 SiC 模块封装打样阶段）。' },
        { id: 'cmt-2', partyId: 'p-t-jingyuan', text: '派驻三名工程师现场联调，开放模块设计文件给参与方核验。' },
        { id: 'cmt-3', partyId: 'p-n-huachi', text: '提供电驱台架与样件测试需求书，验证通过后启动二供议价。' }
      ],
      confirmations: {
        'p-t-jingyuan': { at: '2026-03-21', hash: 'seed' },
        'p-r-s3gen': { at: '2026-03-21', hash: 'seed' },
        'p-n-huachi': { at: '2026-03-22', hash: 'seed' }
      },
      createdAt: '2026-03-10', activatedAt: '2026-03-22'
    },
    {
      id: 'intent-bio-v1', projectKey: 'bio-epatch-jingbei', category: 'bioelectronics',
      title: '电子皮肤康复评估合作（v1：含全院推广）', version: 1, status: 'superseded',
      participantPartyIds: ['p-t-hesheng', 'p-r-bmepku', 'p-n-jingbei'],
      links: { capabilityIds: ['cap-hs-01'], resourceIds: ['res-bme-01'], needIds: ['need-jb-01'] },
      ddRequired: [
        { id: 'ddr-1', title: '临床数据样本', ownerPartyId: 'p-t-hesheng' },
        { id: 'ddr-2', title: '伦理批件', ownerPartyId: 'p-n-jingbei' }
      ],
      commitments: [
        { id: 'cmt-1', partyId: 'p-t-hesheng', text: 'v1：供应 500 片传感贴片并覆盖全院康复科。' }
      ],
      confirmations: {
        'p-t-hesheng': { at: '2026-04-02', hash: 'seed' },
        'p-r-bmepku': { at: '2026-04-02', hash: 'seed' },
        'p-n-jingbei': { at: '2026-04-03', hash: 'seed' }
      },
      createdAt: '2026-03-28', activatedAt: '2026-04-03', supersededAt: '2026-06-05',
      changesNote: 'v1 范围含全院 500 片推广，因数据不出院要求无法满足而改版。'
    },
    {
      id: 'intent-bio-v2', projectKey: 'bio-epatch-jingbei', category: 'bioelectronics',
      title: '电子皮肤康复评估合作（v2：限定康复一科试点）', version: 2, basedOnVersion: 1, status: 'active',
      participantPartyIds: ['p-t-hesheng', 'p-r-bmepku', 'p-n-jingbei'],
      links: { capabilityIds: ['cap-hs-01'], resourceIds: ['res-bme-01'], needIds: ['need-jb-01'] },
      ddRequired: [
        { id: 'ddr-1', title: '临床数据样本', ownerPartyId: 'p-t-hesheng', materialId: 'mat-bio-dd-01' },
        { id: 'ddr-2', title: '伦理批件', ownerPartyId: 'p-n-jingbei', materialId: 'mat-bio-dd-02' }
      ],
      commitments: [
        { id: 'cmt-1', partyId: 'p-t-hesheng', text: 'v2：供应 80 片传感贴片，仅限康复一科试点，数据不出院。' },
        { id: 'cmt-2', partyId: 'p-r-bmepku', text: '提供工艺平台 40 机时并负责伦理材料组织。' }
      ],
      confirmations: {
        'p-t-hesheng': { at: '2026-06-04', hash: 'seed' },
        'p-r-bmepku': { at: '2026-06-04', hash: 'seed' },
        'p-n-jingbei': { at: '2026-06-05', hash: 'seed' }
      },
      createdAt: '2026-05-26', activatedAt: '2026-06-05',
      changesNote: '范围由全院 500 片缩减为康复一科 80 片；v1 未完成的“全院供货”承诺终止，需在 v2 重新确认。'
    },
    {
      id: 'intent-fin', projectKey: 'fin-risk-jingcheng', category: 'finance',
      title: '普惠小微线上风控联合验证', version: 1, status: 'draft',
      participantPartyIds: ['p-t-xintong', 'p-r-fintechlab', 'p-n-jingcheng'],
      links: { capabilityIds: ['cap-xt-01'], resourceIds: ['res-ft-01'], needIds: ['need-jc-01'] },
      ddRequired: [
        { id: 'ddr-1', title: '模型等保测评报告', ownerPartyId: 'p-t-xintong', materialId: 'mat-fin-dd-01' },
        { id: 'ddr-2', title: '银行侧数据接入安全评估', ownerPartyId: 'p-n-jingcheng' }
      ],
      commitments: [
        { id: 'cmt-1', partyId: 'p-t-xintong', text: '部署风控引擎试用环境并配合沙箱联调。' }
      ],
      // 仅两方确认，场景方京城银行尚未确认；且尽调 ddr-2 未齐 → 不完整，不能进入执行
      confirmations: {
        'p-t-xintong': { at: '2026-07-12', hash: 'seed' },
        'p-r-fintechlab': { at: '2026-07-12', hash: 'seed' }
      },
      createdAt: '2026-07-05'
    },
    {
      id: 'intent-sw', projectKey: 'sw-mes-jingxi', category: 'software',
      title: '多车间 MES 统一排产项目', version: 1, status: 'active',
      participantPartyIds: ['p-t-yunzao', 'p-r-riise', 'p-n-jingxi'],
      links: { capabilityIds: ['cap-yz-01'], resourceIds: ['res-ri-01'], needIds: ['need-jx-01'] },
      ddRequired: [
        { id: 'ddr-1', title: '源代码托管凭证', ownerPartyId: 'p-t-yunzao', materialId: 'mat-sw-dd-01' },
        { id: 'ddr-2', title: '信创适配报告', ownerPartyId: 'p-r-riise', materialId: 'mat-sw-dd-02' }
      ],
      commitments: [
        { id: 'cmt-1', partyId: 'p-t-yunzao', text: '交付 MES 平台并完成 5 车间 260 台设备接入，含一年运维。' },
        { id: 'cmt-2', partyId: 'p-r-riise', text: '完成信创栈适配与性能基准测试。' },
        { id: 'cmt-3', partyId: 'p-n-jingxi', text: '按里程碑付款，首笔款随签约，验收后支付尾款。' }
      ],
      confirmations: {
        'p-t-yunzao': { at: '2026-01-20', hash: 'seed' },
        'p-r-riise': { at: '2026-01-20', hash: 'seed' },
        'p-n-jingxi': { at: '2026-01-21', hash: 'seed' }
      },
      createdAt: '2026-01-08', activatedAt: '2026-01-21'
    },
    {
      id: 'intent-fin2', projectKey: 'fin-collect-beifang', category: 'finance',
      title: '贷后催收策略系统合作（已撤回）', version: 1, status: 'withdrawn',
      participantPartyIds: ['p-t-anxin', 'p-r-fintechlab', 'p-n-beifang'],
      links: { capabilityIds: ['cap-ax-01'], resourceIds: ['res-ft-01'], needIds: ['need-bf-01'] },
      ddRequired: [
        { id: 'ddr-1', title: '催收策略规则手册', ownerPartyId: 'p-t-anxin', materialId: 'mat-fin2-dd-01' }
      ],
      commitments: [
        { id: 'cmt-1', partyId: 'p-t-anxin', text: '部署贷后策略系统并完成两个月试运行。' }
      ],
      confirmations: {
        'p-t-anxin': { at: '2026-04-12', hash: 'seed' },
        'p-r-fintechlab': { at: '2026-04-12', hash: 'seed' },
        'p-n-beifang': { at: '2026-04-13', hash: 'seed' }
      },
      createdAt: '2026-04-05', activatedAt: '2026-04-13',
      withdrawnAt: '2026-05-08', withdrawnByPartyId: 'p-n-beifang',
      withdrawReason: '场景方业务合规口径调整，停止后续接入；已发生的接洽与签约事实保留。'
    }
  ];

  const ev = (id, type, ref, partyId, at, note = '') => ({ id, type, ref, uploadedByPartyId: partyId, at, note });

  const milestones = [
    // 半导体：接洽/签约/资源投入 已核验，验证完成进行中，订单未开始
    { id: 'ms-semi-contact', intentId: 'intent-semi', stage: STAGES.CONTACT, title: '三方实质会谈与需求对齐', responsiblePartyIds: ['p-spec', 'p-t-jingyuan'], scope: '中试线合作框架，仅适用于华驰电驱 SiC 模块', prerequisites: [], evidence: [ev('ev-semi-1', 'meeting_minutes', 'MM-20260312-07', 'p-spec', '2026-03-12', '含议题、结论与各方签字')], status: 'done', verifiedAt: '2026-03-12' },
    { id: 'ms-semi-sign', intentId: 'intent-semi', stage: STAGES.SIGNING, title: '三方联合中试协议签署', responsiblePartyIds: ['p-t-jingyuan', 'p-r-s3gen', 'p-n-huachi'], scope: 'v1 有效签署版本，档案号 HT-SEMI-2026-009', prerequisites: [{ kind: 'stage', ref: 'contact', description: '接洽会谈纪要齐备' }], evidence: [ev('ev-semi-2', 'signed_contract', 'HT-SEMI-2026-009', 'p-spec', '2026-03-22')], status: 'done', verifiedAt: '2026-03-22' },
    { id: 'ms-semi-res', intentId: 'intent-semi', stage: STAGES.RESOURCE, title: '中试线机时与驻场工程师到位', responsiblePartyIds: ['p-r-s3gen', 'p-t-jingyuan'], scope: '120 机时 + 台企 3 名驻场工程师', prerequisites: [{ kind: 'stage', ref: 'signing', description: '协议已签署' }], evidence: [ev('ev-semi-3', 'resource_proof', 'RP-20260410-02', 'p-r-s3gen', '2026-04-10', '机时排期单与驻场签到记录')], status: 'done', verifiedAt: '2026-04-10' },
    { id: 'ms-semi-val', intentId: 'intent-semi', stage: STAGES.VALIDATION, title: '功率循环与温度循环联合验证', responsiblePartyIds: ['p-r-s3gen'], scope: '1200V/600A 样品 30 只，按 AEC-Q101 类条件', prerequisites: [{ kind: 'stage', ref: 'resource', description: '机时与人员到位' }], evidence: [], status: 'open' },
    { id: 'ms-semi-order', intentId: 'intent-semi', stage: STAGES.ORDER, title: '二供框架订单', responsiblePartyIds: ['p-n-huachi'], scope: '验证通过后启动，数量与价格待验证报告', prerequisites: [{ kind: 'stage', ref: 'validation', description: '联合验证报告通过' }], evidence: [], status: 'pending' },

    // 生物电子 v1（已被替代）：未完成里程碑保持 blocked
    { id: 'ms-bio-v1-sign', intentId: 'intent-bio-v1', stage: STAGES.SIGNING, title: 'v1 全院推广协议（已被 v2 替代）', responsiblePartyIds: ['p-t-hesheng', 'p-n-jingbei'], scope: 'v1：全院 500 片', prerequisites: [], evidence: [ev('ev-bio-v1-1', 'signed_contract', 'HT-BIO-2026-004-v1', 'p-spec', '2026-04-03')], status: 'done', verifiedAt: '2026-04-03' },
    { id: 'ms-bio-v1-res', intentId: 'intent-bio-v1', stage: STAGES.RESOURCE, title: 'v1 全院贴片供货（500 片）', responsiblePartyIds: ['p-t-hesheng'], scope: '全院范围；v2 已缩减为康复一科 80 片', prerequisites: [{ kind: 'stage', ref: 'signing' }], evidence: [], status: 'blocked', affectedByVersion: 2, blockedReason: 'v2 改版：范围由全院 500 片缩减为康复一科 80 片，全院供货承诺终止，需在 v2 重新确认' },

    // 生物电子 v2（有效版本）：改版专题会接洽、签约沿用并重新签署，资源投入进行中
    { id: 'ms-bio-v2-contact', intentId: 'intent-bio-v2', stage: STAGES.CONTACT, title: 'v2 改版专题会（范围重新对齐）', responsiblePartyIds: ['p-spec', 'p-t-hesheng'], scope: '仅讨论康复一科试点方案与数据不出院要求', prerequisites: [], evidence: [ev('ev-bio-v2-0', 'meeting_minutes', 'MM-20260528-06', 'p-spec', '2026-05-28', 'v2 范围、前置条件与变更点逐条记录')], status: 'done', verifiedAt: '2026-05-28' },
    { id: 'ms-bio-v2-sign', intentId: 'intent-bio-v2', stage: STAGES.SIGNING, title: 'v2 试点协议签署（康复一科）', responsiblePartyIds: ['p-t-hesheng', 'p-r-bmepku', 'p-n-jingbei'], scope: 'v2 有效签署版本 HT-BIO-2026-004-v2，仅康复一科', prerequisites: [], evidence: [ev('ev-bio-v2-1', 'signed_contract', 'HT-BIO-2026-004-v2', 'p-spec', '2026-06-05', '替代 v1，变更范围已逐条标注')], status: 'done', verifiedAt: '2026-06-05' },
    { id: 'ms-bio-v2-res', intentId: 'intent-bio-v2', stage: STAGES.RESOURCE, title: '工艺平台机时与首批 80 片贴片', responsiblePartyIds: ['p-r-bmepku', 'p-t-hesheng'], scope: '康复一科试点，数据不出院', prerequisites: [{ kind: 'stage', ref: 'signing', description: 'v2 协议签署' }], evidence: [], status: 'open' },

    // 金融服务（草案）：仅交换名片 → 接洽不成立，复盘剔除
    { id: 'ms-fin-contact', intentId: 'intent-fin', stage: STAGES.CONTACT, title: '论坛展位交流（仅交换名片）', responsiblePartyIds: ['p-spec'], scope: '论坛现场，未形成议题与结论', prerequisites: [], evidence: [ev('ev-fin-1', 'business_card', 'CARD-20260710-31', 'p-spec', '2026-07-10', '仅有名片，无会谈纪要或意向书')], status: 'pending' },

    // 软件研发：全链路到订单形成并回款
    { id: 'ms-sw-contact', intentId: 'intent-sw', stage: STAGES.CONTACT, title: '需求研讨会', responsiblePartyIds: ['p-spec'], scope: '5 车间 MES 需求', prerequisites: [], evidence: [ev('ev-sw-1', 'meeting_minutes', 'MM-20260110-02', 'p-spec', '2026-01-10')], status: 'done', verifiedAt: '2026-01-10' },
    { id: 'ms-sw-sign', intentId: 'intent-sw', stage: STAGES.SIGNING, title: 'MES 采购与服务合同', responsiblePartyIds: ['p-t-yunzao', 'p-n-jingxi'], scope: 'HT-SW-2026-001', prerequisites: [{ kind: 'stage', ref: 'contact' }], evidence: [ev('ev-sw-2', 'signed_contract', 'HT-SW-2026-001', 'p-spec', '2026-01-21')], status: 'done', verifiedAt: '2026-01-21' },
    { id: 'ms-sw-res', intentId: 'intent-sw', stage: STAGES.RESOURCE, title: '实施团队与信创环境到位', responsiblePartyIds: ['p-t-yunzao', 'p-r-riise'], scope: '12 人实施团队 + 适配中心环境', prerequisites: [{ kind: 'stage', ref: 'signing' }], evidence: [ev('ev-sw-3', 'resource_proof', 'RP-20260205-01', 'p-n-jingxi', '2026-02-05', '团队进场签到与环境开通单')], status: 'done', verifiedAt: '2026-02-05' },
    { id: 'ms-sw-val', intentId: 'intent-sw', stage: STAGES.VALIDATION, title: '五车间上线验收', responsiblePartyIds: ['p-n-jingxi', 'p-r-riise'], scope: '260 台设备联网、排产准确率达标', prerequisites: [{ kind: 'stage', ref: 'resource' }], evidence: [ev('ev-sw-4', 'validation_report', 'VR-20260420-05', 'p-n-jingxi', '2026-04-20', '验收报告三方签章')], status: 'done', verifiedAt: '2026-04-20' },
    { id: 'ms-sw-order', intentId: 'intent-sw', stage: STAGES.ORDER, title: '验收订单与尾款回收', responsiblePartyIds: ['p-n-jingxi'], scope: '含尾款的正式采购订单', prerequisites: [{ kind: 'stage', ref: 'validation' }], evidence: [ev('ev-sw-5', 'purchase_order', 'PO-JX-2026-018', 'p-n-jingxi', '2026-05-06'), ev('ev-sw-6', 'payment_proof', 'PAY-20260601-11', 'p-t-yunzao', '2026-06-01', '尾款到账回单')], status: 'done', verifiedAt: '2026-05-06' },

    // 金融服务项目二：签约后撤回 —— 接洽/签约事实保留，资源投入终止
    { id: 'ms-fin2-contact', intentId: 'intent-fin2', stage: STAGES.CONTACT, title: '贷后合作专题会', responsiblePartyIds: ['p-spec'], scope: '催收策略系统', prerequisites: [], evidence: [ev('ev-fin2-1', 'meeting_minutes', 'MM-20260406-03', 'p-spec', '2026-04-06')], status: 'done', verifiedAt: '2026-04-06' },
    { id: 'ms-fin2-sign', intentId: 'intent-fin2', stage: STAGES.SIGNING, title: '试运行协议签署', responsiblePartyIds: ['p-t-anxin', 'p-n-beifang'], scope: 'HT-AX-2026-002', prerequisites: [{ kind: 'stage', ref: 'contact' }], evidence: [ev('ev-fin2-2', 'signed_contract', 'HT-AX-2026-002', 'p-spec', '2026-04-13')], status: 'done', verifiedAt: '2026-04-13' },
    { id: 'ms-fin2-res', intentId: 'intent-fin2', stage: STAGES.RESOURCE, title: '试运行环境开通（未执行）', responsiblePartyIds: ['p-t-anxin'], scope: '两个月试运行', prerequisites: [{ kind: 'stage', ref: 'signing' }], evidence: [], status: 'terminated', terminatedReason: '意向撤回：仅终止后续动作' }
  ];

  const state = {
    parties, capabilities, researchResources, scenarioNeeds, materials, intents, milestones,
    auditLog: [
      { at: '2026-09-26T09:00:00+08:00', actorPartyId: 'p-spec', action: 'seed', detail: '装入虚构样例数据' }
    ]
  };
  // 用意向正文的真实内容指纹回填确认记录，确保“多方确认同一版本”可校验。
  for (const intent of state.intents) {
    const hash = intentContentHash(intent);
    for (const record of Object.values(intent.confirmations)) record.hash = hash;
  }
  return state;
}

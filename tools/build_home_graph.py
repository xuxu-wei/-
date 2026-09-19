"""Build the homepage atlas from the published course catalog, without learning data.

The five lenses follow Guo Lei (2016), p. 293. Their application to this
curriculum, the colors, and graph layout weights are this project's choices.
No PDF copy, learner record, or generated simulation data enters this artifact.
"""
from collections import Counter
import hashlib
import json
import os
from pathlib import Path
import re
import tempfile

ROOT = Path(__file__).resolve().parents[1]
TAXONOMY = [
    {'id': 'method', 'label': '系统方法论', 'color': '#d1e4e6', 'lightColor': '#2c2f4b', 'description': '组织问题、假设、方法与证据。'},
    {'id': 'evolution', 'label': '系统演化论', 'color': '#f4e1c1', 'lightColor': '#ffb300', 'description': '理解状态、结构与功能在时空中的变化。'},
    {'id': 'cognition', 'label': '系统认知论', 'color': '#2B4A8C', 'lightColor': '#2B4A8C', 'description': '从观测进行表征、建模、估计与学习。'},
    {'id': 'regulation', 'label': '系统调控论', 'color': '#4f7c8c', 'lightColor': '#4f7c8c', 'description': '通过优化、反馈与协同改变系统行为。'},
    {'id': 'practice', 'label': '系统实践论', 'color': '#fbc9b4', 'lightColor': '#fbc9b4', 'description': '在具体问题中实施、核验并解释方法。'},
]

# These are visual lenses, not a replacement for the authoritative course tree.
# Keys use stable part titles so an added/reordered part cannot inherit a wrong lens.
PART_LENSES = {
    '看见系统': ['method', 'cognition'],
    '系统随时间演化': ['evolution', 'method'],
    '多变量相互作用': ['evolution', 'cognition'],
    '非线性动态行为': ['evolution'],
    '随机性与信息': ['cognition', 'evolution'],
    '从测量走向模型': ['cognition', 'method'],
    '状态估计与贝叶斯滤波': ['cognition'],
    '优化方法与计算': ['regulation', 'method'],
    '概率建模与近似推断': ['cognition'],
    '反馈与最优控制': ['regulation'],
    '网络上的系统': ['evolution', 'regulation'],
    '个体与集体现象': ['evolution'],
    '临界变化与韧性': ['evolution', 'regulation'],
    '数据驱动动力学与模型降阶': ['cognition', 'evolution'],
    '可微分建模与机制融合': ['cognition', 'method'],
    '自适应、鲁棒与学习控制': ['regulation', 'cognition'],
    '研究复现与综合实践': ['practice', 'method'],
}

# Short, reviewed concept labels belong to their actual Notebook lesson.
# Identity, titles, URLs, availability and progress always come from catalog.json.
LESSON_CONCEPTS = {
    'P10-C01-S01': ['误差与执行输入', '比例积分控制', '抗积分累积'],
    'P10-C01-S02': ['微分噪声', '条件积分', 'PID 限幅'],
    'P10-C02-S01': ['闭环特征方程', '极点与根轨迹', '阻尼暂态'],
    'P10-C02-S02': ['Bode 幅相', '延迟相位', 'Nyquist 条件'],
    'P10-C03-S01': ['输入位置', '能控矩阵', '受限可达性'],
    'P10-C03-S02': ['状态反馈', '极点配置', '执行代价'],
    'P10-C04-S01': ['传感器位置', '能观矩阵', '不可见方向'],
    'P10-C04-S02': ['观测误差', '输出反馈', '分离条件'],
    'P10-C05-S01': ['终端代价', 'Bellman 递推', '价值函数'],
    'P10-C05-S02': ['有限时域 LQR', 'Riccati 倒推', '时变增益'],
    'P10-C06-S01': ['滚动时域', '硬约束', '不可行状态'],
    'P10-C06-S02': ['重新求解', '预测失配', '备用策略'],
    'P10-C07-S01': ['公平信息边界', '实际输入代价', '失败统计'],
    'P10-C07-S02': ['配对场景', '独立评价', '不确定性范围'],
    'P11-C01-S01': ['邻接与度', '连通分量', '最短路径'],
    'P11-C01-S02': ['规则环与重连', '聚类', '结构随机性'],
    'P11-C02-S01': ['边交换收支', '图拉普拉斯', '总量守恒'],
    'P11-C02-S02': ['零模态', '容积与浓度', '数值步长'],
    'P11-C03-S01': ['同步传播', '固定随机输入', '接触预算'],
    'P11-C03-S02': ['网络重复', '动态重复', '配对比较'],
    'P11-C04-S01': ['相位耦合', '序参量', '反相分群'],
    'P11-C04-S02': ['耦合归一化', '频率锁定', '有限扫描'],
    'P09-C01-S01': ['先验与似然', '共轭更新', '参数与预测'],
    'P09-C01-S02': ['后验曲率', '参数边界', '变量变换与雅可比'],
    'P09-C02-S01': ['Metropolis–Hastings', '提议比', '详细平衡'],
    'P09-C02-S02': ['多链初始化', '自相关', '有效样本量', '有限预算'],
    'P09-C03-S01': ['证据下界', 'KL方向', '均值场近似', '坐标更新'],
    'P09-C03-S02': ['近似族', '多峰与局部解', '枚举参照'],
    'P09-C04-S01': ['责任度', 'EM更新', '标签交换与退化'],
    'P09-C04-S02': ['平滑交叉矩', '动态参数学习', '条件期望'],
    'P09-C05-S01': ['总方差', '混合预测', '可信与预测区间'],
    'P09-C05-S02': ['独立预测', '对数分数', '覆盖与模型失配'],
    'P08-C01-S01': ['目标尺度', '二次型', '梯度与海森矩阵'],
    'P08-C01-S02': ['方向曲率', '凸性', '驻点与最小值'],
    'P08-C02-S01': ['步长谱条件', '条件数', '变量缩放'],
    'P08-C02-S02': ['牛顿方向', '负曲率', '非凸保护'],
    'P08-C02-S03': ['充分下降', '回溯线搜索', '停止残差'],
    'P08-C03-S01': ['岭回归', '共线性', '参数收缩'],
    'P08-C03-S02': ['次梯度', '软阈值', '近端梯度'],
    'P08-C03-S03': ['训练尺度', '验证选参', '独立预测'],
    'P08-C04-S01': ['拉格朗日乘子', 'KKT条件', '互补松弛'],
    'P08-C04-S02': ['活跃集', '可行性证据', '约束残差'],
    'P01-C01-S01': ['系统边界', '状态与观测', '可检验的问题'],
    'P01-C01-S02': ['单位与量纲', '时间序列', '总量与浓度'],
    'P01-C02-S01': ['存量与流率', '分段物质收支', '非负状态'],
    'P01-C02-S02': ['内部交换', '整体守恒'],
    'P01-C03-S01': ['作用方向', '反馈回路', '正反馈与负反馈'],
    'P01-C03-S02': ['调节延迟', '延迟与振荡'],
    'P01-C04-S01': ['更新规则', '模型参数', '初始状态'],
    'P01-C04-S02': ['竞争解释', '对照实验', '可反驳的预测'],
    'P02-C01-S01': ['递推关系', '非负倍数', '等比变化'],
    'P02-C01-S02': ['时间步长', '收支更新', '离散变化率'],
    'P02-C02-S01': ['平均变化率', '导数', '差分近似'],
    'P02-C02-S02': ['矩形累积', '定积分', '有向面积'],
    'P02-C02-S03': ['指数与对数', '链式法则'],
    'P02-C03-S01': ['一阶微分方程', '初值问题', '分离变量'],
    'P02-C03-S02': ['平衡位置', '偏离平衡的半衰时间', '时间常数'],
    'P02-C04-S01': ['数值误差', '网格细化', '收敛阶'],
    'P02-C04-S02': ['数值稳定性', '非负性', '步长约束'],
    'P02-C04-S03': ['分段输入', '输入跳变', '分段求解'],
    'P03-C01-S01': ['两室交换', '矩阵收支', '列和与守恒'],
    'P03-C01-S02': ['内积', '范数', '投影'],
    'P03-C01-S03': ['平衡方程', '矩阵秩', '解的唯一性'],
    'P03-C02-S01': ['状态空间', '输入映射', '观测映射'],
    'P03-C02-S02': ['特征值', '动态模态', '矩阵传播'],
    'P03-C02-S03': ['复数模态', '阻尼旋转'],
    'P03-C03-S01': ['向量场', '相轨迹', '时间参数'],
    'P03-C03-S02': ['交换通道', '平衡集合'],
    'P03-C04-S01': ['偏导数', '梯度', '雅可比矩阵'],
    'P03-C04-S02': ['局部线性化', '线性化误差', '局部稳定性'],
    'P04-C01-S01': ['多个平衡', '稳定与不稳定平衡', '多稳态'],
    'P04-C01-S02': ['吸引域', '有限扰动', '有限时间扫描'],
    'P04-C01-S03': ['不变集合', '点到集合的距离', '吸引子', '中心与吸引'],
    'P04-C02-S01': ['阻尼振荡', '受迫振荡', '自维持振荡'],
    'P04-C02-S02': ['周期', '振幅', '相位'],
    'P04-C03-S01': ['平衡分支', '折叠分岔', '滞回'],
    'P04-C03-S02': ['Hopf 分岔', '周期轨道', '振荡起始'],
    'P04-C04-S01': ['离散映射', '不动点', '周期点'],
    'P04-C04-S02': ['邻近轨迹', '初值敏感性', '预测期限'],
    'P04-C04-S03': ['有限时间增长率', '算术精度', '扰动尺度'],
    'P04-C05-S01': ['Lyapunov 候选函数', '沿轨迹导数', '局部稳定性证明'],
    'P04-C05-S02': ['非严格衰减', '不变集合', '稳定性条件'],
    'P04-C06-S01': ['平面自治流', 'Lorenz 平衡', '雅可比矩阵', '局部稳定性'],
    'P04-C06-S02': ['有界性', '体积收缩', 'RK4 积分', '短时收敛'],
    'P04-C06-S03': ['定向截面', '返回映射', '交点插值', '投影与完整状态'],
    'P04-C06-S04': ['连续变分方程', '分段切向增长', '奇异吸引子', '预测边界'],
    'P05-C01-S01': ['随机事件', '概率分布', '一次实现'],
    'P05-C01-S02': ['重复抽样', '随机种子', '独立重复'],
    'P05-C02-S01': ['期望', '方差', '二阶矩'],
    'P05-C02-S02': ['联合分布', '协方差', '相关与因果'],
    'P05-C02-S03': ['过程噪声', '测量噪声', '个体差异'],
    'P05-C03-S01': ['条件概率', '贝叶斯公式', '先验与后验'],
    'P05-C03-S02': ['高斯更新', '精度加权', '固定未知参数'],
    'P05-C04-S01': ['马尔可夫链', '状态路径', '分布推进'],
    'P05-C04-S02': ['不变分布', '长期收敛', '周期性'],
    'P05-C04-S03': ['随机游走', '漂移', '扩散'],
    'P05-C05-S01': ['信息熵', '条件熵', '互信息'],
    'P05-C05-S02': ['有限样本', '分箱', '信息估计偏差'],
    'P06-C01-S01': ['采样间隔', '混叠', 'Nyquist 频率'],
    'P06-C01-S02': ['因果滤波', '滤波延迟', '平滑与失真'],
    'P06-C02-S01': ['脉冲响应', '线性卷积', '边界补零'],
    'P06-C02-S02': ['复指数', '离散 Fourier 变换', '频率轴'],
    'P06-C02-S03': ['有限记录', '频谱泄漏', '频率响应'],
    'P06-C03-S01': ['线性时不变系统', 'Laplace 变换', '传递函数'],
    'P06-C03-S02': ['Z 变换', '精确采样', '连续与离散极点'],
    'P06-C04-S01': ['最小二乘', '误差假设', '拟合残差'],
    'P06-C04-S02': ['参数网格', '清除曲线', '可辨识性'],
    'P06-C04-S03': ['参数区间', '重复观测', '重采样'],
    'P06-C05-S01': ['ARX 回归', '一步预测', '自由运行'],
    'P06-C05-S02': ['输入激励', '可辨识范围', '信息不足'],
    'P06-C05-S03': ['数据划分', '独立验证', '数据泄漏'],
    'P06-C06-S01': ['秩一更新', '递推最小二乘', '批量与递推等价', '逆信息与参数协方差'],
    'P06-C06-S02': ['指数遗忘', '参数漂移', '弱激励', '在线预测时钟'],
    'P07-C01-S01': ['随机状态模型', '过程噪声', '测量噪声', '估计信息边界'],
    'P07-C01-S02': ['能观矩阵', '可区分状态', '采样与能观性', '噪声放大'],
    'P07-C02-S01': ['边缘化', '贝叶斯递推', '缺测更新', '零证据'],
    'P07-C02-S02': ['隐马尔可夫模型', '在线滤波', '路径枚举'],
    'P07-C03-S01': ['协方差几何', '分块高斯', '条件均值', '条件协方差'],
    'P07-C03-S02': ['Kalman 预测', 'Kalman 观测更新', '缺测分支'],
    'P07-C03-S03': ['创新', '独立重复', '区间覆盖', '不确定性校准'],
    'P07-C04-S01': ['扩展卡尔曼滤波', '雅可比求值位置', '局部近似误差'],
    'P07-C04-S02': ['无迹变换', '确定性采样点', '后验形状', '矩近似'],
    'P07-C05-S01': ['重要性采样', '自归一化权重', '提议支持条件'],
    'P07-C05-S02': ['自助粒子滤波', '有效样本量', '重采样', '样本贫化'],
    'P07-C06-S01': ['前向后向平滑', '未来信息', '在线与离线估计'],
    'P07-C06-S02': ['RTS 平滑', '末端一致性', '连续缺测', '联合条件核验'],
}

# Reviewed against the chapter's knowledge sequence. Keyword extraction alone
# cannot distinguish "covered here" from "deferred to a later chapter".
PLANNED_CONCEPTS = {
    '连续时间混沌与奇异吸引子': ['Lorenz 方程', '体积收缩', '返回截面', '奇异吸引子'],
    '递推辨识与时变参数跟踪': ['信息矩阵', '递推最小二乘', '遗忘因子', '时变参数跟踪'],
    '状态空间与能观性': ['随机状态空间', '条件独立', '能观矩阵', '不可观方向'],
    '贝叶斯递推与隐马尔可夫模型': ['隐马尔可夫模型', '预测与更新', '证据归一化'],
    '卡尔曼滤波': ['多元高斯条件分布', '创新协方差', '卡尔曼增益'],
    '非线性高斯滤波': ['扩展卡尔曼滤波', '无迹卡尔曼滤波', '近似误差'],
    '粒子滤波': ['重要性采样', '粒子权重', '重采样', '有效样本量'],
    '平滑与缺测处理': ['前向后向平滑', 'RTS 平滑', '连续缺测'],
    '目标函数与优化几何': ['目标函数', '可行域', 'Hessian 矩阵', '凸性'],
    '梯度、曲率与迭代算法': ['梯度下降', '牛顿方向', '回溯线搜索', '条件数'],
    '正则化与稀疏优化': ['二范数惩罚', '软阈值', '近端梯度', '稀疏性'],
    '约束与最优性条件': ['拉格朗日乘子', 'KKT 条件', '二次规划', '活动约束'],
    '贝叶斯建模与后验近似': ['似然与先验', '最大后验估计', 'Laplace 近似'],
    '马尔可夫链采样与诊断': ['Metropolis–Hastings 采样', '详细平衡', '链的混合', '有效样本量'],
    '变分推断': ['相对熵', '证据下界', '均值场近似', '坐标更新'],
    '隐变量与参数学习': ['隐变量', '完整数据似然', '期望最大化', '局部最优'],
    '后验预测与模型检验': ['后验预测分布', '后验预测检验', '对数预测分数', '预测覆盖'],
    '开闭环与 PID': ['开环与闭环', 'PID 控制', '执行饱和', '抗积分累积'],
    '频域稳定性与设计': ['根轨迹', '幅相裕度', 'Nyquist 判据'],
    '能控性与状态反馈': ['能控矩阵', '极点配置', '状态反馈'],
    '状态观测器与输出反馈': ['观测器误差动态', '输出反馈', '分离设计'],
    '动态规划与 LQR': ['终端代价', '价值倒推', 'LQR', '权重正定性'],
    '带约束的 MPC': ['预测时域', '滚动优化', '软硬约束', '不可行处理'],
    '估计反馈与闭环验证': ['估计反馈', '独立场景评估', '约束验证', '运行预算'],
    '从连接结构进入网络科学': ['节点与边', '连通性', '图拉普拉斯', '度分布'],
    '网络上的扩散与守恒': ['边上的交换', '拉普拉斯零模态', '扩散与守恒'],
    '接触结构与传播': ['接触网络', '状态转移', '平均混合', '传播规模'],
    '耦合振子与同步': ['相位模型', '网络耦合', '异质频率', '同步指标'],
    '多主体模型与元胞自动机': ['个体与邻域', '同步更新', '元胞自动机', '边界条件'],
    '合作与演化博弈': ['收益矩阵', '复制方程', '空间合作'],
    '选择、变异与适应': ['遗传漂变', '自然选择', '双向变异', '固定与灭绝'],
    '空间自组织与反应扩散': ['空间网格', '有限差分', '反应扩散', '模式形成'],
    '从局部规则到宏观描述': ['个体轨迹聚合', '平均场闭合', '信息损失'],
    '相变、临界性与有限规模': ['序参量', '临界波动', '尺度关系', '有限规模'],
    '级联失效与结构鲁棒性': ['阈值失效', '级联更新', '定向损伤', '结构鲁棒性'],
    '扰动、恢复与早期预警': ['恢复时间', '吸引域', '早期预警', '误报与漏报'],
    '多尺度、粗粒化与不确定性': ['多尺度', '粗粒化', '参数敏感性', '结论不确定性'],
    '低秩分解与模型降阶': ['奇异值分解', '本征正交分解', '低维投影', '截断误差'],
    '动态模态分解': ['动态模态分解', '模态重建', '滚动预测', '对数分支'],
    'Koopman 表示与有限字典': ['Koopman 算子', '观测函数字典', '扩展动态模态分解', '字典闭合'],
    '稀疏动力学辨识': ['候选函数库', '顺序阈值最小二乘', '导数估计', '轨迹留出'],
    '噪声、外推与结构保持': ['结构误差', '守恒与非负性', '范围外预测'],
    '神经网络与自动微分': ['神经网络', '计算图', '反向自动微分', '训练验证边界'],
    '离散动力学学习': ['转移映射', '一步损失', '滚动损失', '自由运行'],
    '神经微分方程': ['神经常微分方程', '前向灵敏度', '伴随灵敏度', '观测时刻跳跃'],
    '物理约束学习': ['物理信息神经网络', '方程残差', '配点', '初边值约束'],
    '混合模型与可辨识性': ['机制修正', '联合学习', '参数补偿', '独立预测'],
    '非线性反馈设计': ['Lyapunov 反馈设计', '能量整形', '区域内稳定性'],
    '模型不确定性与鲁棒控制': ['不确定模型集合', '共同 Lyapunov 函数', '顶点核验', '保守性'],
    '递推辨识与自适应控制': ['在线辨识', '自校正调节', '激励不足', '闭环相关误差'],
    '随机动力学与控制': ['布朗运动', 'Itô 随机微分方程', 'Euler–Maruyama 方法', '期望代价'],
    '分布式控制与通信限制': ['一致性控制', '局部信息', '通信延迟', '不变总量'],
    '强化学习与策略评估': ['马尔可夫决策过程', 'Bellman 方程', '策略改进', 'Q 学习'],
    '模型学习与约束决策': ['预测模型接口', '约束决策', '外推风险', '信息预算'],
    '研究问题与证据': ['研究主张', '复现边界', '公平基线'],
    '复现协议与公平基线': ['数据划分', '基线协议', '随机流', '失败处理'],
    '消融、失效与结论边界': ['消融因素', '配对比较', '失败分析', '结论边界'],
    '研究方法综合比较': ['方法选择', '独立评估', '不确定性', '计算预算'],
}


def question_ids(item):
    if 'questions' in item:
        return [q['id'] for q in item['questions']]
    children = item.get('chapters', item.get('lessons', []))
    return [qid for child in children for qid in question_ids(child)] + (
        question_ids(item['assessment']) if isinstance(item.get('assessment'), dict) else [])


def prerequisite_ids(text, valid_ids):
    """Read explicit chapter references; expand written chapter ranges.

    Later mathematical prerequisite prose is not a second graph of chapters.
    Older outline prose has no '数学：' delimiter, so valid chapter IDs are the guard.
    """
    text = re.split(r'；?数学[：:]', text, maxsplit=1)[0]
    found = set(re.findall(r'(?<!\d)(\d+\.\d+)(?!\d)', text))
    for first, last in re.findall(r'(\d+\.\d+)\s*[—–－-]\s*(\d+\.\d+)', text):
        p1, c1 = map(int, first.split('.'))
        p2, c2 = map(int, last.split('.'))
        if p1 == p2 and c1 <= c2:
            found.update(f'{p1}.{n}' for n in range(c1, c2 + 1))
    return sorted(found & valid_ids, key=lambda cid: tuple(map(int, cid.split('.'))))


def planned_concepts(chapter):
    if chapter['title'] not in PLANNED_CONCEPTS:
        raise ValueError(f"Review planned concepts: {chapter['id']} {chapter['title']}")
    return PLANNED_CONCEPTS[chapter['title']]


def build_graph(catalog, terms, *, catalog_sha256=None):
    term_map = {term['zh']: term['en'] for term in terms}
    valid_ids = {c['id'] for p in catalog['parts'] for c in p['chapters']}
    nodes, edges = [], []
    part_weights = Counter()
    for part in catalog['parts']:
        if part['title'] not in PART_LENSES:
            raise ValueError(f"Review five-lens assignment for new part: {part['title']}")
        categories = PART_LENSES[part['title']]
        published = sum(c['available'] for c in part['chapters'])
        assessment = part.get('assessment') or {}
        pnode = {
            'id': part['id'], 'kind': 'part', 'title': part['title'],
            'number': part['id'], 'parentId': None, 'url': part['url'],
            'description': ' · '.join(c['title'] for c in part['chapters']),
            'categories': categories, 'children': [c['id'] for c in part['chapters']],
            'questionIds': question_ids(part), 'available': bool(published),
            'published': published, 'total': len(part['chapters']),
            'assessmentIds': [l['id'] for l in assessment.get('lessons', [])],
            'assessmentUrl': assessment.get('url'),
            'progressScope': '已发布篇章练习（含篇末综合）',
        }
        nodes.append(pnode)
        for chapter in part['chapters']:
            cnode = {
                'id': chapter['id'], 'kind': 'chapter', 'title': chapter['title'],
                'number': chapter['id'], 'parentId': part['id'], 'url': chapter['url'],
                'description': chapter['goals'], 'categories': categories,
                'children': [], 'questionIds': question_ids(chapter),
                'available': chapter['available'], 'published': int(chapter['available']),
                'total': 1, 'progressScope': '本章练习',
            }
            nodes.append(cnode)
            lesson_groups = []
            if chapter['available']:
                for lesson in chapter['lessons']:
                    if lesson['id'] not in LESSON_CONCEPTS:
                        raise ValueError(f"Review concept labels for new lesson: {lesson['id']} {lesson['title']}")
                    labels = LESSON_CONCEPTS[lesson['id']]
                    assert 2 <= len(labels) <= 4
                    group = []
                    for index, label in enumerate(labels, 1):
                        cid = f"{lesson['number']}:concept:{index}"
                        group.append(cid)
                        nodes.append({
                            'id': cid, 'kind': 'concept', 'title': label, 'english': term_map.get(label), 'number': lesson['number'],
                            'parentId': chapter['id'], 'url': lesson['url'],
                            'description': lesson['outcome'], 'categories': categories,
                            'children': [], 'questionIds': question_ids(lesson),
                            'available': True, 'published': 1, 'total': 1,
                            'lessonId': lesson['id'], 'lessonNumber': lesson['number'],
                            'lessonTitle': lesson['title'], 'chapterUrl': chapter['url'],
                            'progressScope': '所在小节练习（不等同于该概念掌握程度）',
                        })
                    lesson_groups.append(group)
            else:
                group = []
                for index, label in enumerate(planned_concepts(chapter), 1):
                    cid = f"{chapter['id']}:planned:{index}"
                    group.append(cid)
                    nodes.append({
                        'id': cid, 'kind': 'concept', 'title': label, 'english': term_map.get(label), 'number': chapter['id'],
                        'parentId': chapter['id'], 'url': chapter['url'],
                        'description': chapter['goals'], 'categories': categories,
                        'children': [], 'questionIds': [], 'available': False, 'published': 0,
                        'total': 1, 'lessonId': None, 'lessonNumber': None, 'lessonTitle': None,
                        'chapterUrl': chapter['url'], 'progressScope': '教学设计，尚无学习记录',
                    })
                lesson_groups.append(group)
            cnode['children'] = [cid for group in lesson_groups for cid in group]
            for group in lesson_groups:
                for i, source in enumerate(group):
                    for target in group[i + 1:]:
                        edges.append({'source': source, 'target': target, 'weight': 1,
                                      'kind': 'same-lesson' if chapter['available'] else 'outline-relation',
                                      'label': '同节概念关联' if chapter['available'] else '同章设计主题'})
            for first, second in zip(lesson_groups, lesson_groups[1:]):
                edges.append({'source': first[-1], 'target': second[0], 'weight': 1,
                              'kind': 'learning-order', 'label': '小节学习顺序'})
            for prereq in prerequisite_ids(chapter['prerequisites'], valid_ids):
                if prereq == chapter['id']:
                    raise ValueError(f"Self prerequisite: {prereq}")
                edges.append({'source': prereq, 'target': chapter['id'], 'weight': 1,
                              'kind': 'prerequisite', 'label': '直接先修关系'})
                source_part = prereq.split('.')[0]
                if source_part != part['id']:
                    part_weights[(source_part, part['id'])] += 1
    for (source, target), weight in sorted(part_weights.items(), key=lambda x: tuple(map(int, x[0]))):
        edges.append({'source': source, 'target': target, 'weight': weight,
                      'kind': 'part-prerequisite', 'label': f'{weight} 条直接章级先修关系'})
    return {
        'version': 1, 'taxonomy': TAXONOMY,
        'source': {
            'catalogPath': 'web/course/catalog.json', 'catalogSha256': catalog_sha256,
            'title': '郭雷：系统学是什么', 'journal': '系统科学与数学', 'year': 2016,
            'volume': '36(3)', 'pages': '291–301', 'taxonomyPage': 293,
            'note': '五论名称参考原文；课程归类、配色与图形布局由本站设计。连线表达课程先修或同节关联，不表示自然因果或物理引力。',
        },
        'nodes': nodes, 'edges': edges,
    }


def atomic_write_graph(graph, dest):
    """Readers see either the previous valid artifact or the complete replacement."""
    payload = json.dumps(graph, ensure_ascii=False, indent=2) + '\n'
    dest.parent.mkdir(parents=True, exist_ok=True)
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(mode='w', encoding='utf-8', newline='\n',
                                         dir=dest.parent, prefix=f'.{dest.name}.',
                                         suffix='.tmp', delete=False) as stream:
            temporary = Path(stream.name)
            stream.write(payload)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, dest)
    finally:
        if temporary is not None and temporary.exists():
            temporary.unlink()


def build(root=ROOT):
    catalog_path = root / 'web/course/catalog.json'
    catalog_bytes = catalog_path.read_bytes()
    catalog = json.loads(catalog_bytes.decode('utf-8'))
    terms = json.loads((root / 'docs/术语对照.json').read_text(encoding='utf-8'))
    graph = build_graph(catalog, terms, catalog_sha256=hashlib.sha256(catalog_bytes).hexdigest())
    if catalog_path.read_bytes() != catalog_bytes:
        raise RuntimeError('课程目录在图谱构建期间发生变化；原图谱保持不变，请重新构建。')
    atomic_write_graph(graph, root / 'web/home/graph.json')
    print(f"Homepage atlas: {len(graph['nodes'])} nodes, {len(graph['edges'])} edges; no personal learning data.")


if __name__ == '__main__':
    build()

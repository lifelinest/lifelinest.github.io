---
title: ECharts图表展示
date: 2024-06-02 10:00:00
type: "charts"
---

<div class="page-echarts">
  <h2>基本图表示例</h2>
  
  <div class="chart-container">
    <h3>折线图示例</h3>
    <div id="lineChart" style="width: 100%; height: 400px;"></div>
  </div>
  
  <div class="chart-container">
    <h3>柱状图示例</h3>
    <div id="barChart" style="width: 100%; height: 400px;"></div>
  </div>
  
  <div class="chart-container">
    <h3>饼图示例</h3>
    <div id="pieChart" style="width: 100%; height: 400px;"></div>
  </div>
</div>

<script>
// 等待页面加载完成后初始化图表
document.addEventListener('DOMContentLoaded', function() {
  // 折线图示例
  const lineChart = echarts.init(document.getElementById('lineChart'));
  const lineOption = {
    title: {
      text: '月访问量统计'
    },
    tooltip: {
      trigger: 'axis'
    },
    legend: {
      data: ['访问量', '浏览量']
    },
    xAxis: {
      type: 'category',
      data: ['1月', '2月', '3月', '4月', '5月', '6月']
    },
    yAxis: {
      type: 'value'
    },
    series: [
      {
        name: '访问量',
        type: 'line',
        data: [120, 200, 150, 80, 70, 110]
      },
      {
        name: '浏览量',
        type: 'line',
        data: [180, 210, 220, 150, 130, 190]
      }
    ]
  };
  lineChart.setOption(lineOption);
  
  // 柱状图示例
  const barChart = echarts.init(document.getElementById('barChart'));
  const barOption = {
    title: {
      text: '文章分类统计'
    },
    tooltip: {
      trigger: 'axis',
      axisPointer: {
        type: 'shadow'
      }
    },
    xAxis: {
      type: 'category',
      data: ['前端开发', '大学生涯', '生活日常', '技术分享', '其他']
    },
    yAxis: {
      type: 'value'
    },
    series: [
      {
        name: '文章数量',
        type: 'bar',
        data: [28, 15, 12, 20, 5]
      }
    ]
  };
  barChart.setOption(barOption);
  
  // 饼图示例
  const pieChart = echarts.init(document.getElementById('pieChart'));
  const pieOption = {
    title: {
      text: '访问来源分布'
    },
    tooltip: {
      trigger: 'item'
    },
    legend: {
      orient: 'vertical',
      left: 'left'
    },
    series: [
      {
        name: '访问来源',
        type: 'pie',
        radius: '50%',
        data: [
          { value: 35, name: '直接访问' },
          { value: 25, name: '搜索引擎' },
          { value: 20, name: '社交媒体' },
          { value: 15, name: '外部链接' },
          { value: 5, name: '其他' }
        ],
        emphasis: {
          itemStyle: {
            shadowBlur: 10,
            shadowOffsetX: 0,
            shadowColor: 'rgba(0, 0, 0, 0.5)'
          }
        }
      }
    ]
  };
  pieChart.setOption(pieOption);
  
  // 响应式处理
  window.addEventListener('resize', function() {
    lineChart.resize();
    barChart.resize();
    pieChart.resize();
  });
});
</script>

<style>
.chart-container {
  margin-bottom: 40px;
  padding: 20px;
  background-color: var(--anzhiyu-card-bg);
  border-radius: 12px;
  box-shadow: 0 5px 20px rgba(0,0,0,0.05);
}
.chart-container h3 {
  margin-top: 0;
  margin-bottom: 15px;
  color: var(--font-color);
}
.page-echarts h2 {
  margin-bottom: 30px;
  color: var(--font-color);
  text-align: center;
}
</style>
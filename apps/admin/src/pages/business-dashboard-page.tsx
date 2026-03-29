import { Card, Row, Col, Statistic } from 'antd';
import { UserOutlined, FileTextOutlined, DollarOutlined, RiseOutlined } from '@ant-design/icons';
import { useEffect, useState } from 'react';

export default function BusinessDashboard() {
  const [stats, setStats] = useState({
    totalUsers: 0,
    newUsersToday: 0,
    totalRevenue: 0,
    revenueToday: 0,
    totalTasks: 0,
    tasksToday: 0,
    conversionRate: 0,
  });

  useEffect(() => {
    fetch('/api/admin/business-stats').then(r => r.json()).then(setStats);
  }, []);

  return (
    <div>
      <Row gutter={16}>
        <Col span={6}>
          <Card>
            <Statistic title="总用户" value={stats.totalUsers} prefix={<UserOutlined />} />
            <div className="text-sm text-gray-500">今日新增: {stats.newUsersToday}</div>
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic title="总收入" value={stats.totalRevenue} prefix={<DollarOutlined />} precision={2} />
            <div className="text-sm text-gray-500">今日: ¥{stats.revenueToday}</div>
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic title="总任务" value={stats.totalTasks} prefix={<FileTextOutlined />} />
            <div className="text-sm text-gray-500">今日: {stats.tasksToday}</div>
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic title="转化率" value={stats.conversionRate} suffix="%" prefix={<RiseOutlined />} />
          </Card>
        </Col>
      </Row>
    </div>
  );
}

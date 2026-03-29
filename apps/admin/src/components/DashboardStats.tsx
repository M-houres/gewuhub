import { Card, Statistic, Row, Col } from 'antd';
import { UserOutlined, FileTextOutlined, DollarOutlined } from '@ant-design/icons';

export default function DashboardStats({ stats }: any) {
  return (
    <Row gutter={16}>
      <Col span={8}>
        <Card><Statistic title="总用户" value={stats.users} prefix={<UserOutlined />} /></Card>
      </Col>
      <Col span={8}>
        <Card><Statistic title="总任务" value={stats.tasks} prefix={<FileTextOutlined />} /></Card>
      </Col>
      <Col span={8}>
        <Card><Statistic title="总收入" value={stats.revenue} prefix={<DollarOutlined />} /></Card>
      </Col>
    </Row>
  );
}

import { useState, useEffect } from 'react';
import { Modal, Steps, Button } from 'antd';

export default function NewUserGuide() {
  const [visible, setVisible] = useState(false);
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    const hasSeenGuide = localStorage.getItem('hasSeenGuide');
    if (!hasSeenGuide) {
      setVisible(true);
    }
  }, []);

  const steps = [
    { title: '欢迎', content: '欢迎使用Gewu.ai，您的学术写作助手' },
    { title: '注册奖励', content: '完成注册即送100积分' },
    { title: '首次任务', content: '首次使用降重功能额外赠送50积分' },
  ];

  const handleFinish = () => {
    localStorage.setItem('hasSeenGuide', 'true');
    setVisible(false);
  };

  return (
    <Modal open={visible} footer={null} closable={false}>
      <Steps current={current} items={steps} />
      <div className="mt-4">{steps[current].content}</div>
      <div className="mt-4 flex justify-end gap-2">
        {current > 0 && <Button onClick={() => setCurrent(current - 1)}>上一步</Button>}
        {current < steps.length - 1 && <Button type="primary" onClick={() => setCurrent(current + 1)}>下一步</Button>}
        {current === steps.length - 1 && <Button type="primary" onClick={handleFinish}>开始使用</Button>}
      </div>
    </Modal>
  );
}

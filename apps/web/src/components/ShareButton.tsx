import { useState } from 'react';
import { Button, Modal, message } from 'antd';
import { ShareAltOutlined } from '@ant-design/icons';

export default function ShareButton({ taskId }: { taskId: string }) {
  const [visible, setVisible] = useState(false);

  const shareUrl = `${window.location.origin}/share/${taskId}`;

  const handleShare = (platform: string) => {
    const text = '我在Gewu.ai完成了论文降重，效果很好！';
    const urls = {
      wechat: `https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(shareUrl)}`,
      weibo: `https://service.weibo.com/share/share.php?url=${encodeURIComponent(shareUrl)}&title=${encodeURIComponent(text)}`,
      qq: `https://connect.qq.com/widget/shareqq/index.html?url=${encodeURIComponent(shareUrl)}&title=${encodeURIComponent(text)}`,
    };

    if (platform === 'wechat') {
      setVisible(true);
    } else {
      window.open(urls[platform as keyof typeof urls], '_blank');
    }

    // 分享奖励
    fetch('/api/user/share-reward', { method: 'POST', body: JSON.stringify({ taskId, platform }) });
    message.success('分享成功，获得10积分奖励！');
  };

  return (
    <>
      <Button icon={<ShareAltOutlined />} onClick={() => handleShare('weibo')}>分享</Button>
      <Modal open={visible} onCancel={() => setVisible(false)} footer={null}>
        <div className="text-center">
          <img src={`https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(shareUrl)}`} alt="二维码" />
          <p>微信扫码分享</p>
        </div>
      </Modal>
    </>
  );
}

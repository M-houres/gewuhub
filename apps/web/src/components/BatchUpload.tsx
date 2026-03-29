import { Upload, Button, Progress, message } from 'antd';
import { UploadOutlined } from '@ant-design/icons';
import { useState } from 'react';

export default function BatchUpload({ taskType, onComplete }: any) {
  const [progress, setProgress] = useState(0);
  const [uploading, setUploading] = useState(false);

  const handleUpload = async (options: any) => {
    const { fileList } = options;
    setUploading(true);

    const formData = new FormData();
    fileList.forEach((file: any) => {
      formData.append('files', file.originFileObj);
    });
    formData.append('taskType', taskType);

    try {
      const res = await fetch('/api/tasks/batch', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();

      // 轮询进度
      const interval = setInterval(async () => {
        const status = await fetch(`/api/tasks/batch/${data.batchId}`).then(r => r.json());
        setProgress(status.progress);

        if (status.progress === 100) {
          clearInterval(interval);
          message.success('批量处理完成');
          onComplete(status.tasks);
          setUploading(false);
        }
      }, 2000);
    } catch (error) {
      message.error('上传失败');
      setUploading(false);
    }
  };

  return (
    <div className="p-4 border rounded">
      <Upload multiple beforeUpload={() => false} onChange={handleUpload}>
        <Button icon={<UploadOutlined />} disabled={uploading}>
          批量上传文件
        </Button>
      </Upload>
      {uploading && <Progress percent={progress} className="mt-4" />}
    </div>
  );
}

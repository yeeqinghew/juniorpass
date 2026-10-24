import { Spin } from "antd";
import { LoadingOutlined } from "@ant-design/icons";
import "./Spinner.css";

const Spinner = () => {
  return (
    <div className="app-spinner">
      <Spin
        indicator={
          <LoadingOutlined className="app-spinner__icon" spin />
        }
      />
    </div>
  );
};

export default Spinner;

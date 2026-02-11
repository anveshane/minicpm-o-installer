from enum import Enum


class ModelType(Enum):
    SIMPLEX = "simplex"
    DUPLEX = "duplex"
    RELEASE = "release"

    #根据model_type获取模型名称
    @classmethod
    def get_model_name(self, model_type: str):
        if model_type == ModelType.SIMPLEX.value:
            return ModelType.SIMPLEX
        elif model_type == ModelType.DUPLEX.value:
            return ModelType.DUPLEX
        elif model_type == ModelType.RELEASE.value:
            return ModelType.RELEASE
        else:
            raise ValueError(f"不支持的模型类型: {model_type}")
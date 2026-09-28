from support import KB
from support_live import configured_model

model = configured_model()
from pydantic import BaseModel, Field

class SupportAnswer(BaseModel):
    answer: str
    evidence_ids: list[str] = Field(default_factory=list)
    needs_human: bool

formatter = model.with_structured_output(SupportAnswer)
typed = formatter.invoke(
    f"Usá esta evidencia y respondé sobre VPN: {KB['vpn']}"
)
assert isinstance(typed, SupportAnswer)
print(typed.model_dump())

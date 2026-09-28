from support import lookup, SYSTEM
from support_live import configured_model
model = configured_model()
from langchain.agents import create_agent

simple_agent = create_agent(
    model=model,
    tools=[lookup],
    system_prompt=SYSTEM,
)
answer = simple_agent.invoke({
    "messages": [{"role": "user", "content": "Ayuda con VPN"}]
})
print(answer["messages"][-1].content)

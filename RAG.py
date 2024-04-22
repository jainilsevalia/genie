import os
import constants


from langchain import hub
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain_community.document_loaders import DirectoryLoader
from langchain_community.vectorstores import Chroma
from langchain_core.output_parsers import StrOutputParser
from langchain_core.runnables import RunnablePassthrough
# from langchain_openai import ChatOpenAI, OpenAIEmbeddings
from langchain_community.document_loaders import PyPDFLoader
from langchain_core.prompts import ChatPromptTemplate
from langchain_groq import ChatGroq
from langchain_community.embeddings import JinaEmbeddings

os.environ['LANGCHAIN_TRACING_V2'] = 'true'
os.environ['LANGCHAIN_ENDPOINT'] = 'https://api.smith.langchain.com'
os.environ['LANGCHAIN_API_KEY'] = constants.LANGCHAIN_API_KEY
os.environ['GROQ_API_KEY'] = constants.GORQ_APIKEY
os.environ['JINA_API_KEY'] = constants.JINA_APIKEY

#### INDEXING ####

# Load Documents
local_docs_directory = "./data/Sentences_of_table.pdf"

loader = PyPDFLoader(local_docs_directory)
docs = loader.load()

# Split
text_splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=200)
splits = text_splitter.split_documents(docs)

print(len(splits))

# Embed
vectorstore = Chroma.from_documents(documents=splits, 
                                    embedding=JinaEmbeddings())

retriever = vectorstore.as_retriever()
#### RETRIEVAL and GENERATION ####

# Prompt
prompt = hub.pull("rlm/rag-prompt")

# LLM
# llm = ChatOpenAI(model_name="gpt-3.5-turbo", temperature=0)
llm = ChatGroq(temperature=0.9, model_name="Llama3-8b-8192")

# Post-processing
def format_docs(docs):
    return "\n\n".join(doc.page_content for doc in docs)

# Chain
rag_chain = (
    {"context": retriever | format_docs, "question": RunnablePassthrough()}
    | prompt
    | llm
    | StrOutputParser()
)

question = '''

Create a employee shift table to manage warehouse as per below mentioned requirenments

Constraints: 
1)Total available hours per week: 400 hours,
2)Maximum hours per employee per day: 8 hours 
3)Minimum employees required in the warehouse before 4 PM on weekdays: 5 
4)No gaps in shifts if assigned for more than 4 hours 
5)Store schedule: Weekdays: 8 AM - 8 PM Saturday: 8 AM - 6 PM Sunday: 10 AM - 5 PM 

Output Requirements: 
1)A table with days of the week as columns and employee names as rows 
2)Each cell in the table should indicate the shift assigned to the employee on that day
3)A column indicating the requested hours per week for each employee 
4)A column indicating the assigned hours per week for each employee'''

rag_chain.invoke(question)
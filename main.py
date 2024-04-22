import os
import sys
import json
import cProfile
import pstats

# import openai
# from langchain_community.chains import ConversationalRetrievalChain, RetrievalQA
# from langchain_community.chat_models import ChatOpenAI
# from langchain_community.document_loaders import DirectoryLoader, TextLoader
# from langchain_community.embeddings import OpenAIEmbeddings
# from langchain_community.indexes import VectorstoreIndexCreator
# from langchain_community.indexes.vectorstore import VectorStoreIndexWrapper
# from langchain_community.llms import OpenAI
# from langchain_community.vectorstores import Chroma



# import bs4
# from langchain import hub
# from langchain.text_splitter import RecursiveCharacterTextSplitter
# from langchain_community.document_loaders import WebBaseLoader
# from langchain_community.vectorstores import Chroma
# from langchain_core.output_parsers import StrOutputParser
# from langchain_core.runnables import RunnablePassthrough
# from langchain_openai import ChatOpenAI, OpenAIEmbeddings

from flask import Flask, jsonify, request

import constants

app = Flask(__name__)

employees = [ { 'id': 1, 'name': 'Ashley' }, { 'id': 2, 'name': 'Kate' }, { 'id': 3, 'name': 'Joe' }]

@app.route('/', methods=['GET'])
def test_home():
  print(request)
  query = json.loads(request.data)['query11']
  print(query)
  results = []
  with cProfile.Profile() as profile: 
    for i in range(1000000):
      x =  i**2
      results.append(x)
  result = pstats.Stats(profile)
  result.sort_stats(pstats.SortKey.TIME)
  result.print_stats()
  result.dump_stats("results.prof")
  return query

# @app.route('/main', methods=['POST'])
# def main_post_res():
#   with cProfile.Profile() as profile:
#     os.environ['LANGCHAIN_TRACING_V2'] = 'true'
#     os.environ['LANGCHAIN_ENDPOINT'] = 'https://api.smith.langchain.com'
#     os.environ['LANGCHAIN_API_KEY'] = constants.LANGCHAIN_API_KEY
#     os.environ["OPENAI_API_KEY"] = constants.APIKEY

#     # Enable to save to disk & reuse the model (for repeated queries on the same data)
#     PERSIST = False

#     query = None

#     if request.data:
#       query = json.loads(request.data)['query']
#       print(query)

#     if PERSIST and os.path.exists("persist"):
#       print("Reusing index...\n")
#       vectorstore = Chroma(persist_directory="persist", embedding_function=OpenAIEmbeddings())
#       index = VectorStoreIndexWrapper(vectorstore=vectorstore)
#     else:
#       #loader = TextLoader("data/data.txt") # Use this line if you only need data.txt
#       loader = DirectoryLoader("data/")
#       if PERSIST:
#         index = VectorstoreIndexCreator(vectorstore_kwargs={"persist_directory":"persist"}).from_loaders([loader])
#       else:
#         index = VectorstoreIndexCreator().from_loaders([loader])

#     chain = ConversationalRetrievalChain.from_llm(
#       llm=ChatOpenAI(model="gpt-3.5-turbo"),
#       retriever=index.vectorstore.as_retriever(search_kwargs={"k": 1}),
#     )

#     chat_history = []
#     while True:
#       if not query:
#         query = input("Prompt: ")
#       if query in ['quit', 'q', 'exit']:
#         sys.exit()
#       result = chain({"question": query, "chat_history": chat_history})
#       print(result['answer'])

#       chat_history.append((query, result['answer']))
#       query = None
#       return result['answer']
#   result = pstats.Stats(profile)
#   result.sort_stats(pstats.SortKey.TIME)
#   result.print_stats()
#   result.dump_stats("results.prof")

if __name__ == '__main__':
   app.run(port=5000)
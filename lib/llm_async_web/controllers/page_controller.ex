defmodule LlmAsyncWeb.PageController do
  use LlmAsyncWeb, :controller

  def home(conn, _params) do
    render(conn, :home)
  end
end
